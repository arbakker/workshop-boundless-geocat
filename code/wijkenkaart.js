// Base map - openbasiskaart tile layer
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

// Create OpenLayers map object
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
