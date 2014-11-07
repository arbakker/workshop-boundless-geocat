// Base map
var osmLayer = new ol.layer.Tile({source: new ol.source.OSM()});

// Census map layer
var wmsLayer = new ol.layer.Image({
  source: new ol.source.ImageWMS({
    url: 'https://workshop-boundless-geocat.geocat.net/geoserver/it.geosolutions/wms?',
    params: {'LAYERS': 'normalized'}
  }),
  opacity: 0.6
});

// Map object
olMap = new ol.Map({
  target: 'map',
  renderer: ol.RendererHint.CANVAS,
  layers: [osmLayer, wmsLayer],
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
