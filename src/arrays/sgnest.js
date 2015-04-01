import "map";
import "../arrays/merge";
import "../core/rebind";
import "../layout/layout";


d3.sgnest = function() {
  var nest = {},
      keys = [],
      keynames = [],
      sortKeys = [],
      sortValues,
      rollup,
      valueF,
      childrenF = d3_layout_hierarchyChildren,
      leafNodesAreGroups = true;

  function map(mapType, array, depth) {
    if (depth >= keys.length) {
        var values = rollup ? rollup.call(nest, array) : 
                (sortValues ? array.sort(sortValues) : array);
        if (values instanceof Array) {
            values.forEach(function(val) {
                Object.defineProperty(val, "valueLevel", 
                        { value: true });
            });
        } else {
            if (typeof values === "object")
                Object.defineProperty(values, "valueLevel", 
                        { value: true });
        }
        return values;
    }

    var i = -1,
        n = array.length,
        key = keys[depth++],
        keyValue,
        object,
        setter,
        valuesByKey = new d3_Map,
        values;

    //valuesByKey.set("allValues", array);
    while (++i < n) {
      if (values = valuesByKey.get(keyValue = key(object = array[i]))) {
        values.push(object);
      } else {
        valuesByKey.set(keyValue, [object]);
      }
    }

    if (mapType) {
      object = mapType();
      var o = object._;
      setter = function(keyValue, values) {
        object.set(keyValue, map(mapType, values, depth));
      };
    } else {
      object = {};
      var o = object;
      setter = function(keyValue, values) {
        object[keyValue] = map(mapType, values, depth);
      };
    }

    Object.defineProperty(o, "meta", {
            value: {}
        });
    o.meta.records = array;
    if (keynames.length)
        o.meta.dim = keynames[depth-1];
    valuesByKey.forEach(setter);
    return object;
  }

  function entries(map, depth, parentNode) {
    if (depth >= keys.length) return map;

    var array = [],
        sortKey = sortKeys[depth++];
    if (parentNode) array.parentNode = parentNode;

    map.forEach(function(key, keyMap) {
      var entry = {name: key};
      entry.dim = map._.meta.dim;
      if (parentNode) entry.parentNode = parentNode;
      entry.parentList = array;
      var children = entries(keyMap, depth, entry, array);
      if (keyMap.constructor === d3_Map) {
        entry.records = keyMap._.meta.records;
        entry.children = children;
      } else {
        entry.records = keyMap;
        if (!leafNodesAreGroups)
            entry.children = children;
      }
      d3_subclass(entry, node_prototype);
      array.push(entry);
    });
    //if (map._.meta) array.meta = map._.meta;

    return sortKey
        ? array.sort(function(a, b) { return sortKey(a.key, b.key); })
        : array;
  }
  var Node = function() {};
  var node_prototype = Node.prototype;
  node_prototype.toString = function() { return this.name };
  node_prototype.path = function(opts) {
      var path = [];
      if (!(opts && opts.notThis)) path.push(this);
      var ptr = this;
      while ((ptr = ptr.parentNode)) {
          path.unshift(ptr);
      }
      return path;
  };
  node_prototype.namePath = function(opts) {
      opts = delimOpts(opts);
      var path = this.path(opts);
      if (opts.noRoot) path.shift();
      if (opts.backwards || this.backwards) path.reverse(); //kludgy?
      if (opts.dimName) path = _.pluck(path, 'dim');
      if (opts.asArray) return path;
      return path.join(opts.delim);
  };
  // allows delimitter to be given as single string arg 
  // or in obj, like {delim:'==>'}
  function delimOpts(opts) {
      if (typeof opts === "string") opts = {delim: opts};
      opts = opts || {};
      if (!_(opts).has('delim')) opts.delim = '/';
      return opts;
  }

  sg_hierarchyRebind(nest, sghierarchy);

  function groups(array) {
    var mop = map(d3.map, array, 0);
    return entries(mop, 0);
  }
  function tree(array) {
    var mop = map(d3.map, array, 0);
    var rootNode = {
        name: 'root',
        dim: 'root',
        records: mop._.meta.records,
    };
    d3_subclass(rootNode, node_prototype);
    rootNode.children = entries(mop, 0, rootNode);
    return rootNode;
  }

  /*  SHOULD THESE BE PUBLIC?
  nest.map = function(array, mapType) {
    return map(mapType, array, 0);
  };
  nest.entries = function(array) {
    return entries(map(d3.map, array, 0), 0);
  };
  */
  nest.groups = function(array) {
    return groups(array);
  };
  nest.tree = function(array) {
    return tree(array);
  };
  nest.children = function(f) {
    return groups(array);
  };
  nest.children = function(x) {
    if (!arguments.length) return childrenF;
    childrenF = x;
    return nest;
  };

  nest.key = function(d) {
    if (typeof d === "string" || d instanceof String) {
        keys.push(function(e) { return e[d] });
        keynames.push(String(d));
    } else {
        keys.push(d);
    }
    return nest;
  };
  nest.keys = function(a) {
    if (a instanceof Array)
        a.forEach(function(key) { nest.key(key); });
    return nest;
  };
  nest.leafNodesAreGroups = function(bool) {
      leafNodesAreGroups = bool;
      return nest;
  };

  // Specifies the order for the most-recently specified key.
  // Note: only applies to entries. Map keys are unordered!
  nest.sortKeys = function(order) {
    sortKeys[keys.length - 1] = order;
    return nest;
  };

  // Specifies the order for leaf values.
  // Applies to both maps and entries array.
  nest.sortValues = function(order) {
    sortValues = order;
    return nest;
  };

  nest.rollup = function(f) {
    rollup = f;
    return nest;
  };
  nest.value = function(x) {
    if (!arguments.length) return valueF;
    valueF = x;
    return nest;
  };

  return nest;
};

d3.sghierarchy = function() { // same as d3.layout.hierarchy, But
    // doesn't add children and parents. assumes they're already there
  var sort = d3_layout_hierarchySort,
      children = d3_layout_hierarchyChildren,
      value = d3_layout_hierarchyValue;

  function hierarchy(root) {
    var stack = [root],
        nodes = [],
        node;

    root.depth = 0;

    while ((node = stack.pop()) != null) {
      nodes.push(node);
      if ((childs = children.call(hierarchy, node, node.depth)) && (n = childs.length)) {
        var n, childs, child;
        while (--n >= 0) {
          stack.push(child = childs[n]);
          //child.parent = node;
          child.depth = node.depth + 1;
        }
        if (value) node.value = 0;
        //node.children = childs;
      } else {
        if (value) node.value = +value.call(hierarchy, node, node.depth) || 0;
        delete node.children;
      }
    }

    d3_layout_hierarchyVisitAfter(root, function(node) {
      var childs, parent;
      if (sort && (childs = node.children)) childs.sort(sort);
      if (value && (parent = node.parent)) parent.value += node.value;
    });

    return nodes;
  }

  hierarchy.sort = function(x) {
    if (!arguments.length) return sort;
    sort = x;
    return hierarchy;
  };

  hierarchy.children = function(x) {
    if (!arguments.length) return children;
    children = x;
    return hierarchy;
  };

  hierarchy.value = function(x) {
    if (!arguments.length) return value;
    value = x;
    return hierarchy;
  };

  // Re-evaluates the `value` property for the specified hierarchy.
  hierarchy.revalue = function(root) {
    if (value) {
      d3_layout_hierarchyVisitBefore(root, function(node) {
        if (node.children) node.value = 0;
      });
      d3_layout_hierarchyVisitAfter(root, function(node) {
        var parent;
        if (!node.children) node.value = +value.call(hierarchy, node, node.depth) || 0;
        if (parent = node.parent) parent.value += node.value;
      });
    }
    return root;
  };

  return hierarchy;
};

// A method assignment helper for hierarchy subclasses.
function sg_hierarchyRebind(object, hierarchy) {
  d3.rebind(object, hierarchy, "sort", "children", "value");

  // Add an alias for nodes and links, for convenience.
  //object.nodes = object;
  object.nodes = d3.sghierarchy();
  object.links = d3_layout_hierarchyLinks;

  return object;
}

// Pre-order traversal.
function d3_layout_hierarchyVisitBefore(node, callback) {
  var nodes = [node];
  while ((node = nodes.pop()) != null) {
    callback(node);
    if ((children = node.children) && (n = children.length)) {
      var n, children;
      while (--n >= 0) nodes.push(children[n]);
    }
  }
}

// Post-order traversal.
function d3_layout_hierarchyVisitAfter(node, callback) {
  var nodes = [node], nodes2 = [];
  while ((node = nodes.pop()) != null) {
    nodes2.push(node);
    if ((children = node.children) && (n = children.length)) {
      var i = -1, n, children;
      while (++i < n) nodes.push(children[i]);
    }
  }
  while ((node = nodes2.pop()) != null) {
    callback(node);
  }
}

function d3_layout_hierarchyChildren(d) {
  return d.children;
}

function d3_layout_hierarchyValue(d) {
  return d.value;
}

function d3_layout_hierarchySort(a, b) {
  return b.value - a.value;
}

// Returns an array source+target objects for the specified nodes.
function d3_layout_hierarchyLinks(nodes) {
  return d3.merge(nodes.map(function(parent) {
    return (parent.children || []).map(function(child) {
      return {source: parent, target: child};
    });
  }));
}
