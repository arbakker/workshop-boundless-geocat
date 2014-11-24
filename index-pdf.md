# Workshop OpenGeo Suite

> **Note**
>
>
> Check out the [full demonstration application](code/index.html) and play!


## Introduction


![app](http://arbakker.github.io/workshop-boundless-geocat/img/kaart-applicatie.png)

For this adventure in map building, we use the following tools, which if you are following along you will want to install now:

- OpenGeo Suite 4.1.1 (available for Linux, Mac OSX and Windows, follow the [Suite installation instructions](http://suite.opengeo.org/opengeo-docs/installation/index.html))

The basic structure of the application will be

- A spatial table of districts (wijken) in PostGIS containing attributes with many census variables of interest, themed by
- A thematic style in GeoServer, browsed with
- A simple pane-based application in OpenLayers 3, allowing the user to choose the census variable of interest.

This application exercises all the tiers of OpenGeo Suite!


## Getting the Data

In order to keep things simple, we will use a geographic unit that is large enough to be visible on a country-wide map, but small enough to provide a granular view of the data: a district (or wijk in Dutch).
There are about 3000 districts in The Netherlands, enough to provide a detailed view at the national level, but not so many to slow down our mapping engine.


### The data

For this workshop we will be using the dataset [Wijk- en Buurtkaart 2013](http://www.nationaalgeoregister.nl/geonetwork/srv/dut/search#|71c56abd-87e8-4836-b732-98d73c73c112
). Which is a dataset that contains all the geometries of all municipalities, districts and neighbourhoods in the Netherlands, and its attributes are a number of statistical key figures.

- Download the [dataset](http://www.cbs.nl/nl-NL/menu/themas/dossiers/nederland-regionaal/links/2013-buurtkaart-shape-versie-1-el.htm).
- Unzip the file
- You will only need the wijk_2013_v1 Shapefile


## Loading the Data

> **Note**
>
> The next steps will involve some database work.
>
>- If you haven’t already installed the OpenGeo Suite, follow the [Suite installation instructions](http://suite.opengeo.org/opengeo-docs/installation/index.html).
>- Open up pgAdmin3 and [create a spatial database](http://suite.opengeo.org/opengeo-docs/dataadmin/pgGettingStarted/createdb.html) named opengeo to load data into.

### Loading the Shapefile

Loading the wijk_2013_v1.shp file is pretty easy, either using the command line or the shape loader GUI. Just remember that our target table name is wijken. Here’s the command-line:

      shp2pgsql -I -s 28992 -W "LATIN1" wijk_2013_v1.shp wijken | psql opengeo

And this is what the GUI looks like (use the Options button to set the DBF character encoding to LATIN1):

![gui_shploader](http://arbakker.github.io/workshop-boundless-geocat/img/shploader.png)

Note that, that the shapefile contains a number of attributes such as wk_naam.

## Drawing the Map
Our challenge now is to set up a rendering system that can easily render any of our 59 columns of census data as a map.

We could define 59 layers in GeoServer, and set up 59 separate styles to provide attractive renderings of each variable. But that would be a lot of work, and we’re much too lazy to do that. What we want is a single layer that can be re-used to render any column of interest.

### One Layer to Rule them All

Using a [parametric SQL](http://docs.geoserver.org/stable/en/user/data/database/sqlview.html#using-a-parametric-sql-view) view we can define a SQL-based layer definition that allows us to change the column of interest by substituting a variable when making a WMS map rendering call.

For example, this SQL definition will allow us to substitute any column we want into the map rendering chain:

<pre><code class="sql">SELECT wk_code, wk_naam, gm_code, gm_naam, water, %column% AS data
    FROM wijken;</code></pre>

### Preparing the Data

According to the [documentation (see section 3 table 1)](http://download.cbs.nl/regionale-kaarten/toelichting-buurtkaart-2013-v1.pdf) the NoData values of the Wijken en Buurten dataset are set to -99999997, -99999998 and -99999999. To make sure that these are correctly displayed , these values need to be set to NULL. Execute the following sql query on the database opengeo to do this:

      DO $$
      DECLARE
         col_names CURSOR FOR  SELECT column_name as cn, data_type as dt
            from information_schema.columns
            where table_name='wijken';
      BEGIN

         FOR col_name_row IN col_names LOOP
            IF  col_name_row.cn not in ('wk_code','wk_naam','gm_code','gm_naam','water', 'geom' ) THEN
               RAISE NOTICE 'Updating column %', col_name_row.cn;
               EXECUTE format ('UPDATE wijken SET %I=null WHERE CAST(%I AS int) in (-99999997,-99999998,-99999999)', col_name_row.cn, col_name_row.cn);
            END IF;
         END LOOP;
      END$$;


### One Style to Rule them All

Viewing our data via a parametric SQL view doesn’t quite get us over the goal line though, because we still need to create a thematic style for the data, and the data in our 59 columns have vastly different ranges and distributions:

- some are percentages
- some are absolute population counts
- some are medians or averages of absolutes

We need to somehow get all this different data onto one scale, preferably one that provides for easy visual comparisons between variables.

The answer is to use the average and standard deviation of the data to normalize it to a standard scale.

![normal_distribution](http://workshops.boundlessgeo.com/tutorial-censusmap/_images/stddev.png)

For example:

- For data set D, suppose the avg(D) is 10 and the stddev(D) is 5.
- What will the average and standard deviation of (D - 10) / 5 be?
- The average will be 0 and the standard deviation will be 1.

Let’s try it on our own census data.

      SELECT Avg(AANT_INW), Stddev(AANT_INW) FROM wijken;

      --           avg          |      stddev
      -- -----------------------+-------------------
      --  6342.9073724007561437 | 9864.171304604906

      SELECT Avg((AANT_INW - 6342.9073724007561437) / 9864.171304604906),
             Stddev((AANT_INW - 6342.9073724007561437) / 9864.171304604906)
      FROM wijken;

      --     avg    | stddev
      -- -----------+--------
      --      ~0    |     ~1

So we can easily convert any of our data into a scale that centers on 0 and where one standard deviation equals one unit just by normalizing the data with the average and standard deviation!

Our new parametric SQL view will look like this:

      -- Precompute the Avg and StdDev,
      WITH stats AS (
        SELECT Avg(%column%) AS avg,
               Stddev(%column%) AS stddev
        FROM wijken
      )
      SELECT
        wijken.gm_naam,
        wijken.wk_naam,
        wijken.geom,
        %column% as data
        (%column% - avg)/stddev AS normalized_data
      FROM stats,wijken

The query first calculates the overall statistics for the column, then applies those stats to the data in the table wijken, serving up a normalized view of the data.

With our data normalized, we are ready to create one style to rule them all!

- Our style will have two colors, one to indicate counties “above average” and the other for “below average”
- Within those two colors it will have 3 shades, for a total of 6 bins in all
- In order to divide up the population more or less evenly, the bins will be
    - (#b2182b) -1.0 and down (very below average)
    - (#ef8a62) -1.0 to -0.5 (below average)
    - (#fddbc7) -0.5 to 0.0 (a little below average)
    - (#d1e5f0) 0.0 to 0.5 (a little above average)
    - (#67a9cf) 0.5 to 1.0 (above average)
    - (#2166ac) 1.0 and up (very above average)

The colors above weren’t chosen randomly! We used [ColorBrewer](http://colorbrewer2.org/) for creating this color scheme, because ColorBrewer provides palettes that have been tested for maximum readability and to some extent aesthetic quality. Here’s the palette for a bit of a Dutch atmosphere (although a red-blue color scale might not be the best option considering the normative assocation with these colors (blue good,red bad), a more neutral color scale could be a better option, feel free to experiment).

![colorbrewer](http://arbakker.github.io/workshop-boundless-geocat/img/color-brewer.png)

> **Note**
>
> You can access the OpenGeo Suite GeoServer through http://localhost:8080/geoserver/web/

- Configure a new style in GeoServer by going to the Styles section, and selecting Add a new style.
- Set the style name to stddev
- Set the style workspace to opengeo
- Paste in the style definition (below) for [stddev.xml](data/stddev.xml) and hit the Save button at the bottom

      &lt;?xml version=&quot;1.0&quot; encoding=&quot;ISO-8859-1&quot;?&gt;
      &lt;StyledLayerDescriptor version=&quot;1.0.0&quot;
        xmlns=&quot;http://www.opengis.net/sld&quot;
        xmlns:ogc=&quot;http://www.opengis.net/ogc&quot;
        xmlns:xlink=&quot;http://www.w3.org/1999/xlink&quot;
        xmlns:xsi=&quot;http://www.w3.org/2001/XMLSchema-instance&quot;
        xmlns:gml=&quot;http://www.opengis.net/gml&quot;
        xsi:schemaLocation=&quot;http://www.opengis.net/sld
        http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd&quot;&gt;

        &lt;NamedLayer&gt;
          &lt;Name&gt;opengeo:stddev&lt;/Name&gt;
          &lt;UserStyle&gt;

            &lt;Name&gt;Standard Deviation Ranges&lt;/Name&gt;

            &lt;FeatureTypeStyle&gt;

              &lt;Rule&gt;
                &lt;Name&gt;StdDev &amp;lt; -1.0&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsLessThan&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:Literal&gt;-1.0&lt;/ogc:Literal&gt;
                  &lt;/ogc:PropertyIsLessThan&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                   &lt;Fill&gt;
                      &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                      &lt;CssParameter name=&quot;fill&quot;&gt;#b2182b&lt;/CssParameter&gt;
                   &lt;/Fill&gt;
                   &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

              &lt;Rule&gt;
                &lt;Name&gt;-1.0 &amp;lt; StdDev &amp;lt; -0.5&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsBetween&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:LowerBoundary&gt;
                      &lt;ogc:Literal&gt;-1.0&lt;/ogc:Literal&gt;
                    &lt;/ogc:LowerBoundary&gt;
                    &lt;ogc:UpperBoundary&gt;
                      &lt;ogc:Literal&gt;-0.5&lt;/ogc:Literal&gt;
                    &lt;/ogc:UpperBoundary&gt;
                  &lt;/ogc:PropertyIsBetween&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                  &lt;Fill&gt;
                    &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                    &lt;CssParameter name=&quot;fill&quot;&gt;#ef8a62&lt;/CssParameter&gt;
                  &lt;/Fill&gt;
                  &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

              &lt;Rule&gt;
                &lt;Name&gt;-0.5 &amp;lt; StdDev &amp;lt; 0.0&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsBetween&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:LowerBoundary&gt;
                      &lt;ogc:Literal&gt;-0.5&lt;/ogc:Literal&gt;
                    &lt;/ogc:LowerBoundary&gt;
                    &lt;ogc:UpperBoundary&gt;
                      &lt;ogc:Literal&gt;0.0&lt;/ogc:Literal&gt;
                    &lt;/ogc:UpperBoundary&gt;
                  &lt;/ogc:PropertyIsBetween&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                  &lt;Fill&gt;
                    &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                    &lt;CssParameter name=&quot;fill&quot;&gt;#fddbc7&lt;/CssParameter&gt;
                  &lt;/Fill&gt;
                  &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

              &lt;Rule&gt;
                &lt;Name&gt;0.0 &amp;lt; StdDev &amp;lt; 0.5&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsBetween&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:LowerBoundary&gt;
                      &lt;ogc:Literal&gt;0.0&lt;/ogc:Literal&gt;
                    &lt;/ogc:LowerBoundary&gt;
                    &lt;ogc:UpperBoundary&gt;
                      &lt;ogc:Literal&gt;0.5&lt;/ogc:Literal&gt;
                    &lt;/ogc:UpperBoundary&gt;
                  &lt;/ogc:PropertyIsBetween&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                  &lt;Fill&gt;
                    &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                    &lt;CssParameter name=&quot;fill&quot;&gt;#d1e5f0&lt;/CssParameter&gt;
                  &lt;/Fill&gt;
                  &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

              &lt;Rule&gt;
                &lt;Name&gt;0.5 &amp;lt; StdDev &amp;lt; 1.0&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsBetween&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:LowerBoundary&gt;
                      &lt;ogc:Literal&gt;0.5&lt;/ogc:Literal&gt;
                    &lt;/ogc:LowerBoundary&gt;
                    &lt;ogc:UpperBoundary&gt;
                      &lt;ogc:Literal&gt;1.0&lt;/ogc:Literal&gt;
                    &lt;/ogc:UpperBoundary&gt;
                  &lt;/ogc:PropertyIsBetween&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                  &lt;Fill&gt;
                    &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                    &lt;CssParameter name=&quot;fill&quot;&gt;#67a9cf&lt;/CssParameter&gt;
                  &lt;/Fill&gt;
                  &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

              &lt;Rule&gt;
                &lt;Name&gt;1.0 &amp;lt; StdDev&lt;/Name&gt;
                &lt;ogc:Filter&gt;
                  &lt;ogc:PropertyIsGreaterThan&gt;
                    &lt;ogc:PropertyName&gt;normalized_data&lt;/ogc:PropertyName&gt;
                    &lt;ogc:Literal&gt;1.0&lt;/ogc:Literal&gt;
                  &lt;/ogc:PropertyIsGreaterThan&gt;
                &lt;/ogc:Filter&gt;
                &lt;PolygonSymbolizer&gt;
                   &lt;Fill&gt;
                      &lt;!-- CssParameters allowed are fill and fill-opacity --&gt;
                      &lt;CssParameter name=&quot;fill&quot;&gt;#2166ac&lt;/CssParameter&gt;
                   &lt;/Fill&gt;
                  &lt;Stroke&gt;
                     &lt;CssParameter name=&quot;stroke&quot;&gt;#1F1F1F&lt;/CssParameter&gt;
                     &lt;CssParameter name=&quot;stroke-width&quot;&gt;.25&lt;/CssParameter&gt;
                   &lt;/Stroke&gt;
                &lt;/PolygonSymbolizer&gt;
              &lt;/Rule&gt;

           &lt;/FeatureTypeStyle&gt;
          &lt;/UserStyle&gt;
        &lt;/NamedLayer&gt;
      &lt;/StyledLayerDescriptor&gt;

Now we have a style, we just need to create a layer that uses it!

### Creating a SQL view

First, we need a PostGIS store that connects to our database

- Go to the Stores section of GeoServer and Add a new store
- Select a PostGIS store
- Set the workspace to opengeo
- Set the datasource name to wijken
- Set the database to opengeo
- Set the user to postgres
- Set the password to postgres
- Save the store

You’ll be taken immediately to the New Layer panel (how handy) where you should:

- Click on Configure new SQL view...
- Set the view name to normalized
- Set the SQL statement to

<pre><code  class="sql">-- Precompute the Avg and StdDev,
-- then normalize table
WITH stats AS (
  SELECT Avg(%column%) AS avg,
         Stddev(%column%) AS stddev
  FROM wijken
)
SELECT
  wijken.geom,
  wijken.wk_code as wijk_code,
  wijken.wk_naam || 'Wijk' As wijk,
  wijken.gm_naam || 'Gemeente' As gemeente,
  '%column%'::text As variable,
  %column%::real As data,
  (%column% - avg)/stddev AS normalized_data
FROM stats, wijken</code></pre>

- Click the Guess parameters from SQL link in the “SQL view parameters” section
- Set the default value of the “column” parameter to aant_inw
- Check the “Guess geometry type and srid” box
- Click the Refresh link in the “Attributes” section
- Select the wijk_code column as the “Identifier”
- Click Save

You’ll be taken immediately to the Edit Layer panel (how handy) where you should:

- In the Data tab
    - Under “Bounding Boxes” click Compute from data
    - Under “Bounding Boxes” click Compute from native bounds
- In the Publishing tab
    - Set the Default Style to stddev
- In the Tile Caching tab
    - Uncheck the “Create a cached layer for this layer” entry
    - Hit the Save button

That’s it, the layer is ready!

- Go to the Layer Preview section
- For the “opengeo:normalized” layer, click Go

![preview](http://arbakker.github.io/workshop-boundless-geocat/img/preview.png)

We can change the column we’re viewing by altering the column view parameter in the WMS request URL.

- Here is the default column:
[https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized](https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized)
- Here is the AUTO_LAND column:
[https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized&viewparams=column:AUTO_LAND](https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized&viewparams=column:AUTO_LAND)
- Here is the AF_ZIEK_E column:
[https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized&viewparams=column:AF_ZIEK_E](https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms/reflect?layers=normalized&viewparams=column:AF_ZIEK_E)

The column names that the census uses are pretty opaque aren’t they? What we need is a web app that lets us see nice human readable column information, and also lets us change the column we’re viewing on the fly.

## Building the App

### Preparing the Metadata

The first thing we need for our app is a data file that maps the short, unpractical column names in our census table to human readable information. Fortunately, the [dictionary.txt](data/dictionary.txt) file has all the information we need. The dictionary.txt file was created by copy pasting the text of the [Buurten en Wijken documentation pdf](http://download.cbs.nl/regionale-kaarten/toelichting-buurtkaart-2013-v1.pdf) in a [text file](data/census_nl-fields.txt) and combining this with a [list](data/column_names.txt) of all the columns of the Buurten en Wijken dataset with a [python script](data/extract-dictionary.py.txt).  

The list of column names was necessary because the documentation of the Buurten en Wijken en dataset lists a lot more attributes than the <a href="http://www.nationaalgeoregister.nl/geonetwork/srv/dut/search#|71c56abd-87e8-4836-b732-98d73c73c112">file</a> that we have downloaded from the NGR.

Here’s a couple example lines from the [dictionary.txt](data/dictionary.txt) file :

- P_HH_M_K: Huishoudens met kinderen [%]
- GEM_HH_GR: Gemiddelde huishoudensgrootte [absoluut]
- P_WEST_AL: Westers totaal [%]

Each line has the column name and a human readable description. Fortunately the information is nicely seperated by a colon in the text file, so the fields can be extracted by using a `split(":")` function.

We’re going to consume this information in a JavaScript web application. The text file can easily be read in and split into lines. Each line can be split into an array with at position 0 the attribute code and at position 1 the attribute description to populate a topics dropdown.


### Framing the Map

We already saw our map visualized in a bare [OpenLayers 2](http://www.openlayers.org/two) map frame in the Layer Preview section of GeoServer.

We want an application that provides a user interface component that manipulates the source WMS URL, altering the URL [viewparams](http://docs.geoserver.org/stable/en/user/data/database/sqlview.html#using-a-parametric-sql-view) parameter.

We’ll build the app using [Bootstrap](http://getbootstrap.com/) for a straightforward layout with CSS, and [OpenLayers 3](http://www.openlayers.org/) as the map component.

The base HTML page, [index.html](code/index.html), contains script and stylesheet includes bringing in our various libraries. A custom stylesheet gives us a fullscreen map with a legend overlay. Bootstrap css classes are used to style the navigation bar. Containers for the map and a header navigation bar with the aforementioned topics dropdown are also included, and an image element with the legend image from a WMS *GetLegendGraphic* request is put inside the map container.

      &lt;!DOCTYPE html&gt;
      &lt;html&gt;
        &lt;head&gt;
          &lt;title&gt;Boundless Census Map&lt;/title&gt;
          &lt;!-- Bootstrap --&gt;
          &lt;link rel=&quot;stylesheet&quot; href=&quot;resources/bootstrap/css/bootstrap.min.css&quot; type=&quot;text/css&quot;&gt;
          &lt;link rel=&quot;stylesheet&quot; href=&quot;resources/bootstrap/css/bootstrap-theme.min.css&quot; type=&quot;text/css&quot;&gt;
          &lt;script src=&quot;resources/jquery-1.10.2.min.js&quot;&gt;&lt;/script&gt;
          &lt;script src=&quot;resources/bootstrap/js/bootstrap.min.js&quot;&gt;&lt;/script&gt;
          &lt;!-- OpenLayers --&gt;
          &lt;link rel=&quot;stylesheet&quot; href=&quot;resources/ol3/ol.css&quot;&gt;
          &lt;script src=&quot;resources/ol3/ol.js&quot;&gt;&lt;/script&gt;
          &lt;!-- Our Application --&gt;
          &lt;style&gt;
            html, body, #map {
              height: 100%;
            }
            #map {
              padding-top: 50px;
            }
            .legend {
              position: absolute;
              z-index: 1;
              left: 10px;
              bottom: 10px;
              opacity: 0.6;
            }
          &lt;/style&gt;
        &lt;/head&gt;
        &lt;body&gt;
          &lt;nav class=&quot;navbar navbar-inverse navbar-fixed-top&quot; role=&quot;navigation&quot;&gt;
            &lt;div class=&quot;navbar-header&quot;&gt;
              &lt;a class=&quot;navbar-brand&quot; href=&quot;#&quot;&gt;Boundless Census Map&lt;/a&gt;
            &lt;/div&gt;
            &lt;form class=&quot;navbar-form navbar-right&quot;&gt;
              &lt;div class=&quot;form-group&quot;&gt;
                &lt;select id=&quot;topics&quot; class=&quot;form-control&quot;&gt;&lt;/select&gt;
              &lt;/div&gt;
            &lt;/form&gt;
          &lt;/nav&gt;
          &lt;div id=&quot;map&quot;&gt;
            &lt;!-- GetLegendGraphic, customized with some LEGEND_OPTIONS --&gt;
            &lt;img class=&quot;legend img-rounded&quot; src=&quot;https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms?REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&WIDTH=26&HEIGHT=18&STRICT=false&LAYER=normalized&LEGEND_OPTIONS=fontName:sans-serif;fontSize:11;fontAntiAliasing:true;fontStyle:normal;fontColor:0xFFFFFF;bgColor:0x000000quot;&gt;
          &lt;/div&gt;
          &lt;script type=&quot;text/javascript&quot; src=&quot;wijkenkaart.js&quot;&gt;&lt;/script&gt;
        &lt;/body&gt;
      &lt;/html&gt;

The real code is in the [wijkenkaart.js](code/wijkenkaart.js) file. We start by creating an [Openbasiskaart](http://openbasiskaart.nl) base layer, and adding our parameterized census layer on top as an image layer with a [WMS Layer source](http://openlayers.org/en/master/apidoc/ol.source.ImageWMS.html).

      // Base map
      var extent = [-285401.920000,22598.080000,595401.920000,903401.920000];
      var resolutions = [3440.64,1720.32,860.16,430.08,215.04,107.52,53.76,26.88,13.44,6.72,3.36,1.68,0.84,0.42,0.21];

      var projection = new ol.proj.Projection({
          code: 'EPSG:28992',
          units: 'meters',
          extent: extent
      });

      var url = 'http://openbasiskaart.nl/mapcache/tms/1.0.0/osm@rd/';

      var tileUrlFunction = function(tileCoord, pixelRatio, projection) {
        var zxy = tileCoord;
        if (zxy[1] < 0 || zxy[2] < 0) {
          return "";
        }
        return url +
          zxy[0].toString()+'/'+ zxy[1].toString() +'/'+
          zxy[2].toString() +'.png';
      };

      var openbasiskaartLayer = new ol.layer.Tile({
        preload: 0,
        source: new ol.source.TileImage({
          crossOrigin: null,
          extent: extent,
          projection: projection,
          tileGrid: new ol.tilegrid.TileGrid({
            origin: [-285401.920000,22598.080000],
            resolutions: resolutions
          }),
          tileUrlFunction: tileUrlFunction
        })
      });

      // Census map layer
      var wmsLayer = new ol.layer.Image({
        source: new ol.source.ImageWMS({
          url: 'https://workshop-boundless-geocat.geocat.net/geoserver/opengeo/wms?',
          params: {'LAYERS': 'normalized'}
        }),
        opacity: 0.6
      });

      // Map object
      olMap = new ol.Map({
        target: 'map',
        layers: [
        openbasiskaartLayer, wmsLayer
        ],
        view: new ol.View({
          projection: projection,
          center: [150000, 450000],
          zoom: 2
        })
      });

We configure an [OpenLayers Map](http://openlayers.org/en/master/apidoc/ol.Map.html), assign the layers, and give it a map view with a center and zoom level. Now the map will load.

The select element with the id topics will be our drop-down list of available columns. We load the [dictionary.txt](data/dictionary.txt) file, and fill the select element with its contents. This is done by adding an option child for each line.

      // Load variables into dropdown
      $.get("../data/dictionary.txt", function(response) {
        // We start at line 3 - line 1 is column names, line 2 is not a variable
        $(response.split('\n')).each(function(index, line) {
          $('#topics').append($("&lt;option&gt;")
            .val(line.split(":")[0].trim())
            .html(line.split(":")[1].trim()));
        });
      });</code></pre>

      <pre><code class="javascript">// Add behaviour to dropdown
      $('#topics').change(function() {
        wmsLayer.getSource().updateParams({
          'viewparams': 'column:' + $('#topics>option:selected').val()
        });
      });

Look at the the [wijkenkaart.js](code/wijkenkaart.js) file to see the whole application in one page.

When we open the [index.html](code/index.html) file, we see the application in action.

![census-app](http://arbakker.github.io/workshop-boundless-geocat/img/kaart-applicatie.png)

## Conclusion

We’ve built an application for browsing 59 different census variables, using less than 100 lines of JavaScript application code, and demonstrating:

- SQL views provide a powerful means of manipulating data on the fly.
- Standard deviations make for attractive visualization breaks.
- Professionally generated color palettes are better than programmer generated ones.
- Simple OpenLayers applications are easy to build.
- Census data can be really, really interesting!
- The application is easy to extend. With 20 more lines of code we can handle clicks and display feature information.

## Can't get enough?

Try to implement one of these [examples](http://openlayers.org/en/v3.0.0/examples/) in your own map.
