import "../core/class";
import "nest";
import "map";

d3.easynest = function(nest) {
    nest || (nest = d3.nest());
    var nestFields = [];
    nest.nestFields = function() {
        Array.prototype.push.apply(nestFields, arguments);
        nestFields.forEach(function(field) {
            nest.key(function(d) {
                return d[field];
            });
        });
        console.log(nestFields);
    };
    return nest;
};
