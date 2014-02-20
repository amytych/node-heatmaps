HeatmapJS
=========

Node port of excellent heatmap.js library
Info and docs can be found on the [original github page](https://github.com/pa7/heatmap.js)


Example
=======

````javascript
var heatmap = require('heatmaps').Heatmap;

var h = heatmap({
  radius: 15,
  width: 500,
  height: 500
});

h.store.setDataSet({
  max: 1000,
  // Originaly data was an array of objects {x:, y:, count:}
  // in my port it is an array of arrays [x, y, count]
  data: [[0, 0, 500], [250, 250, 1000], [500, 500, 500]]
});

// Get buffer which you could use as a request response or write it to a file
image = h.getImageBuffer()
````

Install
=======

With [npm](http://npmjs.org), just do:

    npm install heatmaps
