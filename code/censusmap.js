// Base map
//var osmLayer = new ol.layer.Tile({source: new ol.source.OSM()});
var mapboxLayer =new ol.layer.Tile({
  source: new ol.source.XYZ({
    url: 'http://api.tiles.mapbox.com/v4/arbakker.a4255e61/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiYXJiYWtrZXIiLCJhIjoiZnhKY29VNCJ9.2NU3RDNmc16br3JRywdAvA'
  })
});

var projection = ol.proj.get('EPSG:28992');
var projectionExtent = projection.getExtent();
var size = ol.extent.getWidth(projectionExtent) / 256;
var resolutions = new Array(21);
var matrixIds = new Array(21);
for (var z = 0; z < 21; ++z) {
  // generate resolutions and matrixIds arrays for this WMTS
  resolutions[z] = size / Math.pow(2, z);
  matrixIds[z] = z;
}

var openbasiskaartLayer = new ol.layer.Tile({
      opacity: 0.7,
      extent: projectionExtent,
      source: new ol.source.WMTS({
        attributions: [attribution],
        url: 'http://www.opengis.net/wmts/1.0 http://schemas.opengis.net/wmts',
        layer: '0',
        matrixSet: 'EPSG:28992',
        format: 'image/png',
        projection: projection,
        tileGrid: new ol.tilegrid.WMTS({
          origin: ol.extent.getTopLeft(projectionExtent),
          resolutions: resolutions,
          matrixIds: matrixIds
        }),
        style: 'default'
      })
    });


// Census map layer
var wmsLayer = new ol.layer.Image({
  source: new ol.source.ImageWMS({
    url: 'https://workshop-boundless-geocat.geocat.net/geoserver/it.geosolutions/wms?',
    params: {'LAYERS': 'normalized'}
  }),
  opacity: 0.6
});

// Map object
/*
olMap = new ol.Map({
  target: 'map',
  renderer: ol.RendererHint.CANVAS,
  layers: [mapboxLayer, wmsLayer],
  view: new ol.View2D({
    center: [548488.744033247, 6776044.612217913],
    zoom: 7
  })
});
*/

olMap = new ol.Map({
  target: 'map',
  layers: [
  openbasiskaartLayer, wmsLayer
  ],
  renderer: ol.RendererHint.CANVAS,
  view: new ol.View2D({
    center: [548488.744033247, 6776044.612217913],
    zoom: 7
  })
});



// Load variables into dropdown
$.get("../data/dictionary.txt", function(response) {
  // We start at line 3 - line 1 is column names, line 2 is not a variable
  $(response.split('\n')).each(function(index, line) {
    $('#topics').append($('<option>')
      .val(line.split(":")[0].trim())
      .html(line.split(":")[1].trim()));
  });
});

// Add behaviour to dropdown
$('#topics').change(function() {
  wmsLayer.getSource().updateParams({
    'viewparams': 'column:' + $('#topics>option:selected').val()
  });
});

// Create an ol.Overlay with a popup anchored to the map
var popup = new ol.Overlay({
  element: $('#popup')
});
olMap.addOverlay(popup);

// Handle map clicks to send a GetFeatureInfo request and open the popup
olMap.on('singleclick', function(evt) {
  olMap.getFeatureInfo({
    pixel: evt.getPixel(),
    success: function (info) {
      popup.setPosition(evt.getCoordinate());
      $('#popup')
        .popover('destroy')
        .popover({content: info.join('')})
        .popover('show');
      // Close popup when user clicks on the 'x'
      $('.popover-title').click(function() {
        $('#popup').popover('hide');
      });
    }
  });
});
