---
layout: page
permalink: /
---


## Introduction


![app](img/census_hispanic.png)

For this adventure in map building, we use the following tools, which if you are following along you will want to install now:

- OpenGeo Suite 4 (available for Linux, Mac OSX and Windows, follow the [Suite installation instructions](http://suite.opengeo.org/opengeo-docs/installation/index.html))

The basic structure of the application will be

- A spatial table of counties in PostGIS, that will join with
- An attribute table with many census variables of interest, themed by
- A thematic style in GeoServer, browsed with
- A simple pane-based application in OpenLayers, allowing the user to choose the census variable of interest.

This application exercises all the tiers of the OpenGeo Suite!


## Getting the Data

In order to keep things simple, we will use a geographic unit that is large enough to be visible on a country-wide map, but small enough to provide a granular view of the data: a district (or wijk in Dutch).
There are about 3000 districts in the Netherlands, enough to provide a detailed view at the national level, but not so many to slow down our mapping engine.


### The Data

For this workshop we will be using the dataset [Wijk- en Buurtkaart 2013](http://www.nationaalgeoregister.nl/geonetwork/srv/dut/search#|71c56abd-87e8-4836-b732-98d73c73c112
). Which is a dataset that contains all the geometries of all municipalities, districts and neighbourhoods in the Netherlands, and its attribute is a number of statiscal key figures.

- Download the [dataset](http://www.cbs.nl/nl-NL/menu/themas/dossiers/nederland-regionaal/links/2013-buurtkaart-shape-versie-1-el.htm).
- Unzip the file
- You will only need `wijk_2013_v1.shp`


## Loading the Data

> **Note**
>
> The next steps will involve some database work.
>
>- If you haven’t already installed the OpenGeo Suite, follow the [Suite installation instructions](http://suite.opengeo.org/opengeo-docs/installation/index.html).
>- [Create a spatial database](http://suite.opengeo.org/opengeo-docs/dataadmin/pgGettingStarted/createdb.html) named wijken to load data into.

### Loading the Shapefile

Loading the `wijk_2013_v1.shp` file is pretty easy, either using the command line or the shape loader GUI. Just remember that our target table name is counties. Here’s the command-line:

<pre><code class="bash">shp2pgsql -I -s 28992 -W "LATIN1" wijk_2013_v1.shp wijken | psql wijken</code></pre>

And this is what the GUI looks like:

![gui_shploader](http://workshops.boundlessgeo.com/tutorial-censusmap/_images/shploader.png)

Note that, that the shapefile contains a number of attributes

## Drawing the Map
Our challenge now is to set up a rendering system that can easily render any of our 59 columns of census data as a map.

We could define 59 layers in GeoServer, and set up 59 separate styles to provide attractive renderings of each variable. But that would be a lot of work, and we’re much too lazy to do that. What we want is a single layer that can be re-used to render any column of interest.

### One Layer to Rule them All

Using a [parametric SQL](http://docs.geoserver.org/stable/en/user/data/database/sqlview.html#using-a-parametric-sql-view) view we can define a SQL-based layer definition that allows us to change the column of interest by substituting a variable when making a WMS map rendering call.

For example, this SQL definition will allow us to substitute any column we want into the map rendering chain:

<pre><code class="sql">SELECT wk_code, wk_naam, gm_code, gm_naam, water, %column% AS data
    FROM wijken;</code></pre>

### Preparing the Data

According to the [documentation](http://download.cbs.nl/regionale-kaarten/toelichting-buurtkaart-2013-v1.pdf) the NoData values of the Wijken en Buurten dataset are set to -99999997, -99999998 and -99999999. To make sure that these are correctly displayed , these values need to be set to NULL.

<pre><code class="sql">DO $$
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
END$$;</code></pre>


### One Style to Rule them All

Viewing our data via a parametric SQL view doesn’t quite get us over the goal line though, because we still need to create a thematic style for the data, and the data in our 51 columns have vastly different ranges and distributions:

- some are percentages
- some are absolute population counts
- some are medians or averages of absolutes

We need to somehow get all this different data onto one scale, preferably one that provides for easy visual comparisons between variables.

The answer is to use the average and standard deviation of the data to normalize it to a standard scale

![normal_distribution](http://workshops.boundlessgeo.com/tutorial-censusmap/_images/stddev.png)

For example:

- For data set D, suppose the avg(D) is 10 and the stddev(D) is 5.
- What will the average and standard deviation of (D - 10) / 5 be?
- The average will be 0 and the standard deviation will be 1.

Let’s try it on our own census data.

<pre><code class="sql">SELECT Avg(pst045212), Stddev(pst045212) FROM census;

--
--        avg        |     stddev
-- ------------------+-----------------
--  99877.2001272669 | 319578.62862369

SELECT Avg((pst045212 - 99877.2001272669) / 319578.62862369),
       Stddev((pst045212 - 99877.2001272669) / 319578.62862369)
FROM census;

--     avg    | stddev
-- -----------+--------
--      0     |      1</code></pre>

So we can easily convert any of our data into a scale that centers on 0 and where one standard deviation equals one unit just by normalizing the data with the average and standard deviation!

Our new parametric SQL view will look like this:


## Building the App

## Conclusion
We’ve built an application for browsing 51 different census variables, using less than 51 lines of JavaScript application code, and demonstrating:
- SQL views provide a powerful means of manipulating data on the fly.
- Standard deviations make for attractive visualization breaks.
- Professionally generated color palettes are better than programmer generated ones.
- Simple OpenLayers applications are easy to build.
- Census data can be really, really interesting!
- The application is easy to extend. With 20 more lines of code we can handle clicks and display feature information.
