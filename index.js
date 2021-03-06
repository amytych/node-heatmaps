/*
 * Node port of heatmap.js
 * Arek Mytych (amytych@gmail.com)
 *
 * Original release info:
 * heatmap.js 1.0 -    JavaScript Heatmap Library
 *
 * Copyright (c) 2011, Patrick Wied (http://www.patrick-wied.at)
 * Dual-licensed under the MIT (http://www.opensource.org/licenses/mit-license.php)
 * and the Beerware (http://en.wikipedia.org/wiki/Beerware) license.
 */

var Canvas = require('canvas');

function createCanvas(width, height) {
  if (typeof Canvas !== 'undefined') {
    return new Canvas(width, height);
  }
}

module.exports.create = function (config) {
  return new Heatmap(config);
};

// store object constructor
// a heatmap contains a store
// the store has to know about the heatmap in order to trigger heatmap updates when datapoints get added
var Store = function (hmap) {
  var _ = {
    // data is a two dimensional array
    // a datapoint gets saved as data[point-x-value][point-y-value]
    // the value at [point-x-value][point-y-value] is the occurrence of the datapoint
    data: [],
    // tight coupling of the heatmap object
    heatmap: hmap
  };

  // the max occurrence - the heatmaps radial gradient alpha transition is based on it
  this.max = 1;

  this.get = function (key) {
    return _[key];
  };

  this.set = function (key, value) {
    _[key] = value;
  };
};

  // function for adding datapoints to the store
  // datapoints are usually defined by x and y but could also contain a third parameter which represents the occurrence
Store.prototype.addDataPoint = function (x, y) {
  if (x < 0 || y < 0) {
    return;
  }

  var me = this,
    heatmap = me.get('heatmap'),
    data = me.get('data');

  if (!data[x]) {
    data[x] = [];
  }

  if (!data[x][y]) {
    data[x][y] = 0;
  }

  // if count parameter is set increment by count otherwise by 1
  data[x][y] += (arguments.length < 3) ? 1 : arguments[2];

  me.set('data', data);
  // do we have a new maximum?
  if (me.max < data[x][y]) {
    // max changed, we need to redraw all existing(lower) datapoints
    heatmap.get('actx').clearRect(0, 0, heatmap.get('width'), heatmap.get('height'));
    me.setDataSet({ max: data[x][y], data: data }, true);
    return;
  }
  heatmap.drawAlpha(x, y, data[x][y], true);
};

Store.prototype.setDataSet = function (obj, internal) {
  var me = this,
    heatmap = me.get('heatmap'),
    data = [],
    d = obj.data,
    dlen = d.length;

  // clear the heatmap before the data set gets drawn
  heatmap.clear();
  this.max = obj.max;

  if (internal != null && internal) {
    for (var one in d) {
      // jump over undefined indexes
      if (one === undefined) {
        continue;
      }
      for (var two in d[one]) {
        if (two === undefined) {
          continue;
        }
        // if both indexes are defined, push the values into the array
        heatmap.drawAlpha(one, two, d[one][two], false);
      }
    }
  } else {
    while (dlen--) {
      var point = d[dlen];
      heatmap.drawAlpha(point[0], point[1], point[2], false);
      if (!data[point[0]]) {
        data[point[0]] = [];
      }

      if (!data[point[0]][point[1]]) {
        data[point[0]][point[1]] = 0;
      }

      data[point[0]][point[1]] = point[2];
    }
  }
  heatmap.colorize();
  this.set('data', d);
};


var Heatmap = function (config) {
  // private variables
  var _ = {
    radius : 40,
    canvas : {},
    acanvas: {},
    ctx : {},
    actx : {},
    legend: null,
    visible : true,
    width : 0,
    height : 0,
    max : false,
    gradient : false,
    opacity: 180,
    premultiplyAlpha: false,
    bounds: {
      l: 1000,
      r: 0,
      t: 1000,
      b: 0
    },
    debug: false
  };

  // heatmap store containing the datapoints and information about the maximum
  // accessible via instance.store
  this.store = new Store(this);

  this.get = function (key) {
    return _[key];
  };

  this.set = function (key, value) {
    _[key] = value;
  };

  // configure the heatmap when an instance gets created
  this.configure(config);
  // and initialize it
  this.init();
};

Heatmap.prototype.configure = function (config) {
  var me = this;

  me.set('radius', config.radius || 40);
  me.set('visible', (config.visible !== null) ? config.visible : true);
  me.set('max', config.max || false);
  // default is the common blue to red gradient
  me.set('gradient', config.gradient || {0.55: 'rgb(0,0,255)', 0.65: 'rgb(0,255,255)', 0.75: 'rgb(0,255,0)', 0.95: 'yellow', 1.0: 'rgb(255,0,0)'});
  me.set('opacity', parseInt(255 / (100 / config.opacity), 10) || 180);
  me.set('width', config.width || 0);
  me.set('height', config.height || 0);
  me.set('debug', config.debug);
};

Heatmap.prototype.resize = function () {
  var me = this,
    canvas = me.get('canvas'),
    acanvas = me.get('acanvas');

  canvas.width = acanvas.width = me.get('width');
  this.set('width', canvas.width);
  canvas.height = acanvas.height = me.get('height');
  this.set('height', canvas.height);
};

Heatmap.prototype.init = function () {
  var me = this,
    canvas = createCanvas(me.get('width'), me.get('height')),
    acanvas = createCanvas(me.get('width'), me.get('height')),
    ctx = canvas.getContext('2d'),
    actx = acanvas.getContext('2d');

  me.initColorPalette();

  me.set('canvas', canvas);
  me.set('ctx', ctx);
  me.set('acanvas', acanvas);
  me.set('actx', actx);

  me.resize();

  actx.shadowOffsetX = 15000;
  actx.shadowOffsetY = 15000;
  actx.shadowBlur = 15;
};

Heatmap.prototype.initColorPalette = function () {
  var me = this,
    canvas = createCanvas(1, 256),
    gradient = me.get('gradient'),
    ctx, grad, testData, imageData;

  ctx = canvas.getContext('2d');
  grad = ctx.createLinearGradient(0, 0, 1, 256);

  // Test how the browser renders alpha by setting a partially transparent pixel
  // and reading the result.  A good browser will return a value reasonably close
  // to what was set.  Some browsers (e.g. on Android) will return a ridiculously wrong value.
  testData = ctx.getImageData(0, 0, 1, 1);
  testData.data[0] = testData.data[3] = 64; // 25% red & alpha
  testData.data[1] = testData.data[2] = 0; // 0% blue & green
  ctx.putImageData(testData, 0, 0);
  testData = ctx.getImageData(0, 0, 1, 1);
  me.set('premultiplyAlpha', (testData.data[0] < 60 || testData.data[0] > 70));

  for (var x in gradient) {
    grad.addColorStop(parseFloat(x), gradient[x]);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);

  imageData = ctx.getImageData(0, 0, 1, 256).data;
  me.set('gradient', imageData);
};

Heatmap.prototype.colorize = function (x, y) {
  // get the private variables
  var me = this,
    width = me.get('width'),
    radius = me.get('radius'),
    height = me.get('height'),
    actx = me.get('actx'),
    ctx = me.get('ctx'),
    x2 = radius * 3,
    premultiplyAlpha = me.get('premultiplyAlpha'),
    palette = me.get('gradient'),
    opacity = me.get('opacity'),
    bounds = me.get('bounds'),
    left, top, bottom, right,
    image, imageData, length, alpha, offset, finalAlpha;

  if (x != null && y != null) {
    if (x + x2 > width) {
      x = width - x2;
    }
    if (x < 0) {
      x = 0;
    }
    if (y < 0) {
      y = 0;
    }
    if (y + x2 > height) {
      y = height - x2;
    }
    left = x;
    top = y;
    right = x + x2;
    bottom = y + x2;

  } else {
    if (bounds.l < 0) {
      left = 0;
    } else {
      left = bounds.l;
    }
    if (bounds.r > width) {
      right = width;
    } else {
      right = bounds.r;
    }
    if (bounds.t < 0) {
      top = 0;
    } else {
      top = bounds.t;
    }
    if (bounds.b > height) {
      bottom = height;
    } else {
      bottom = bounds.b;
    }
  }

  image = actx.getImageData(left, top, right - left, bottom -  top);
  imageData = image.data;
  length = imageData.length;

  // loop thru the area
  for (var i = 3; i < length; i += 4) {

    // [0] -> r, [1] -> g, [2] -> b, [3] -> alpha
    alpha = imageData[i];
    offset = alpha * 4;

    if (!offset) {
      continue;
    }

    // we ve started with i=3
    // set the new r, g and b values
    finalAlpha = (alpha < opacity) ? alpha : opacity;
    imageData[i - 3] = palette[offset];
    imageData[i - 2] = palette[offset + 1];
    imageData[i - 1] = palette[offset + 2];

    if (premultiplyAlpha) {
      // To fix browsers that premultiply incorrectly, we'll pass in a value scaled
      // appropriately so when the multiplication happens the correct value will result.
      imageData[i - 3] /= 255 / finalAlpha;
      imageData[i - 2] /= 255 / finalAlpha;
      imageData[i - 1] /= 255 / finalAlpha;
    }

    // we want the heatmap to have a gradient from transparent to the colors
    // as long as alpha is lower than the defined opacity (maximum), we'll use the alpha value
    imageData[i] = finalAlpha;
  }
  // the rgb data manipulation didn't affect the ImageData object(defined on the top)
  // after the manipulation process we have to set the manipulated data to the ImageData object
  image.data = imageData;
  ctx.putImageData(image, left, top);
};

Heatmap.prototype.drawAlpha = function (x, y, count, colorize) {
  // storing the variables because they will be often used
  var me = this,
    radius = me.get('radius'),
    ctx = me.get('actx'),
    bounds = me.get('bounds'),
    xb = x - (1.5 * radius) >> 0,
    yb = y - (1.5 * radius) >> 0,
    xc = x + (1.5 * radius) >> 0,
    yc = y + (1.5 * radius) >> 0,
    g, a;

  // Shadows where used in original implementation. See:
  // https://github.com/pa7/heatmap.js/blob/master/src/heatmap.js#L559-L568
  // Unfortunately they produced weird results in node's canvas.
  // That's why I used radial gradients instead.
  g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  a = count ? count / me.store.max : 0.1;

  g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  if (colorize) {
    // finally colorize the area
    me.colorize(xb, yb);
  } else {
    // or update the boundaries for the area that then should be colorized
    if (xb < bounds.l) {
      bounds.l = xb;
    }
    if (yb < bounds.t) {
      bounds.t = yb;
    }
    if (xc > bounds.r) {
      bounds.r = xc;
    }
    if (yc > bounds.b) {
      bounds.b = yc;
    }
  }
};

// dataURL export
Heatmap.prototype.getImageData = function () {
  return this.get('canvas').toDataURL();
};

// Export image to buffer
Heatmap.prototype.getImageBuffer = function () {
  return this.get('canvas').toBuffer();
};

Heatmap.prototype.clear = function () {
  var me = this,
    w = me.get('width'),
    h = me.get('height');

  me.store.set('data', []);
  // @TODO: reset stores max to 1
  //me.store.max = 1;
  me.get('ctx').clearRect(0, 0, w, h);
  me.get('actx').clearRect(0, 0, w, h);
};
