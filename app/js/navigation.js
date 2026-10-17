(function (root) {
  'use strict';
  var K = root.KickTV;
  K.visible = function (el) { return !!el && !el.disabled && el.offsetWidth > 0 && el.offsetHeight > 0; };
  K.focusables = function (scope) {
    var nodes = scope.querySelectorAll('button,input,textarea,[tabindex="0"]'), result = [];
    for (var i = 0; i < nodes.length; i++) if (K.visible(nodes[i])) result.push(nodes[i]);
    return result;
  };
  K.moveFocus = function (scope, key) {
    var nodes = K.focusables(scope), current = document.activeElement;
    if (nodes.indexOf(current) < 0) { if (nodes[0]) nodes[0].focus(); return; }
    var rect = current.getBoundingClientRect(), best = null, score = Infinity;
    var x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] === current) continue;
      var r = nodes[i].getBoundingClientRect(), dx = (r.left + r.right) / 2 - x, dy = (r.top + r.bottom) / 2 - y;
      var primary = key === 37 ? -dx : key === 39 ? dx : key === 38 ? -dy : dy;
      var secondary = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
      if (primary <= 1) continue;
      var candidate = primary + secondary * 3;
      if (candidate < score) { best = nodes[i]; score = candidate; }
    }
    if (best) best.focus();
  };
}(typeof window !== 'undefined' ? window : global));
