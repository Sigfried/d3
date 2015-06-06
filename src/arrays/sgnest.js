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
      childrenF = d3_layout_hierarchyChildren,
      valueF, // could be d3_layout_hierarchyValue, but want it to default to nothing
      //sortF,  // d3_layout_hierarchySort
      cloneRecords = false,
      noCycles = false,
      leafNodesAreGroups = true;

  function map(mapType, array, depth, parentMap) {
    if (depth === 0 && cloneRecords) {
        array = array.map(function(o) {
            var clone = {};
            for (key in o)
                clone[key] = o[key];
            return clone;
        });
    }
    if (depth >= keys.length) {
        var values = rollup ? rollup.call(nest, array) : 
                (sortValues ? array.sort(sortValues) : array);
        if (values instanceof Array) {
            values.forEach(function(val) {
                addMeta(val, values, depth, parentMap);
                val.meta.isRecord = true;
                //Object.defineProperty(val, "valueLevel", { value: true });
            });
            //addMeta(values, values, depth);
        } else {
            throw new Error("never being called?");
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

    while (++i < n) {
      if (values = valuesByKey.get(keyValue = key(object = array[i]))) {
        values.push(object);
      } else {
        valuesByKey.set(keyValue, [object]);
      }
    }

    if (mapType) {
      object = mapType();
      setter = function(keyValue, values) {
        object.set(keyValue, map(mapType, values, depth, object));
        addMeta(object.get(keyValue), values, depth, object);
      };
    } else {
      //  this is here (from original d3.nest) so it works without a d3_Map
      object = {};
      setter = function(keyValue, values) {
        object[keyValue] = map(mapType, values, depth);
        addMeta(object[keyValue], values, depth, object);
      };
    }
    valuesByKey.forEach(setter);
    if (depth===1) addMeta(object, array, 0);
    return object;
  }
  function addMeta(o, array, depth, parentMap) {
    if (!o.meta)
      Object.defineProperty(o, "meta", {
            value: {}
        });
    else {
      if (!o.meta.isRecord)
        console.error("didn't expect meta on a Node already");
      console.warn("meta already present on raw record");
    }
    o.meta.records = array;
    o.meta.depth = depth;
    if (keynames.length)
        o.meta.dim = (depth > 0) ? keynames[depth-1] : 'root';
    if (parentMap) o.meta.parentMap = parentMap;
  }

  function entries(map, depth, parentNode) {
    if (depth >= keys.length) return map;

    var array = [],
        sortKey = sortKeys[depth++];
    if (parentNode && !noCycles) array.parentNode = parentNode;
    d3_subclass(array, list_prototype);

    map.forEach(function(key, keyMap) {
      var entry = {name: key};
      entry.dim = keyMap.meta.dim;
      entry.depth = keyMap.meta.depth;
      if (!noCycles) {
        if (parentNode) entry.parentNode = parentNode;
        entry.parentList = array;
      }
      var children = entries(keyMap, depth, entry, array);
      if (keyMap.constructor === d3_Map) {
        entry.records = keyMap.meta.records;
        entry.children = children;
      } else {
        entry.records = keyMap;
        if (!leafNodesAreGroups)
            entry.children = children;
      }
      d3_subclass(entry, node_prototype);
      array.push(entry);
      map.set(key, entry); // re-use map as entry lookup dict
      //entry.lookupMap = keyMap;
    });

    array = sortKey
        ? array.sort(function(a, b) { return sortKey(a.key, b.key); })
        : array;
    array.lookupMap = map;
    return array;
  }
  var list_prototype = [];
  list_prototype.lookup = function(query, die) {
    if (!Array.isArray(query)) {
      var node = this.lookupMap.get(query);
    } else if (query.length) {
      var first = query.shift();
      if (this.lookupMap.has(first))
        var node = this.lookupMap.get(first);
        if (query.length)
          return node.lookup(query, die);
    }
    if (node) return node;
    if (die)
      throw new Error("lookup failed");
  };

  var Node = function() {};
  var node_prototype = Node.prototype;
  node_prototype.lookup = function(query, die) {
    if (!this.children)
      throw new Error("can only call lookup on nodes with children");
    var node = this.children.lookup(query, die);
    if (!node) {
      if (Array.isArray(query)) {
        var lookupStr = query.shift();
        if (this.name === lookupStr)
          return this.lookup(query, die); // with remainder of lookup string array
      } else {
        if (this.name === query)
          return this;
      }
      if (die)
        throw new Error("lookup failed");
    }
    return node;
  };
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
  node_prototype.dimPath = function(opts) {
      opts = delimOpts(opts);
      opts.dimName = true;
      return this.namePath(opts);
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
        records: mop.meta.records,
        lookupMap: mop,
    };
    d3_subclass(rootNode, node_prototype);
    rootNode.children = entries(mop, 0, rootNode);
    return rootNode;
  }

  nest.map = function(array, mapType) {
    return map(mapType, array, 0);
  };
  nest.entries = function(array) {
    return entries(map(d3.map, array, 0), 0);
  };
  nest.groups = function(array) {
    return groups(array);
  };
  nest.tree = function(array) {
    return tree(array);
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
    if (Array.isArray(a))
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
  nest.noCycles = function(bool) {
    if (!arguments.length) return noCycles;
    noCycles = bool;
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

