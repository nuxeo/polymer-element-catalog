var path = require('path');
var fs = require('fs-extra');

var _ = require('lodash');
var async = require('async');

var stream = require('./utils/stream').obj;
var packageDetails = require('./utils/package-details');
var analyze = require('./utils/analyze');
var cleanTags = require('./utils/clean-tags');

module.exports = function (imports) {

  var root = imports.root;
  var destDir = path.join(root, imports.destDir);
  var bowerFile = require(root + '/bower.json');
  var deps = bowerFile.dependencies;

  var data = [];

  return stream.compose(
    stream.parse('packages.*'),
    stream.filter(function(package) {
      return deps[package.name];
    }),
    stream.asyncMap(function (package, done) {

      var packageBower = packageDetails({
        root: root,
        name: package.name
      });

      fs.mkdirsSync(path.join(destDir, 'data', 'docs'));

      var packageHtml = path.join(root, 'bower_components', package.name, package.name + '.html');
      analyze(package.name, [packageHtml], function(err, packageData) {

        var elements = packageData.elements; //.concat(packageData.behaviors);

        var filtered = packageBower.elements || package.elements;
        if (filtered) {
          elements = elements.filter(function (el) {
            return filtered.indexOf(el.is) !== -1;
          })
        }

        var output = async.map(elements, function (element, cb) {

          var elementName = element.is;

          console.log("-", elementName, "(" + packageBower._release + ")");

          // write element info
          var out = {elements: [element], elementsByTagName: {}, behaviors: [], features: []};

          out.elementsByTagName[element.is] = element;

          if (element.behaviors) {
            out.behaviors = packageData.behaviors.filter(function(behavior) {
              return element.behaviors.indexOf(behavior.is) !== -1;
            });
          }

          fs.writeFileSync(path.join(destDir, 'data', 'docs', elementName + '.json'), JSON.stringify(out));
          
          var description, active, demo, hero;
          if (element.desc) {
            var lines = element.desc.split('\n');
            for (var i = 0; i < lines.length; i++) {
              if (lines[i]) {
                description = lines[i];
                break;
              }
            }
          }

          if (element.demos) {
            active = elementName;
            demo = (element.demos || [])[0] || null;
          }

          if (element.hero) {
            var base = path.dirname(path.relative(root, element.contentHref));
            hero = path.join(base, element.hero);
          }
          cb(err, {
            name: elementName,
            version: packageBower._release,
            source: packageBower._originalSource,
            target: packageBower._target,
            package: package.name,
            description: description,
            tags: (packageBower.keywords || []).filter(cleanTags),
            hero: hero,
            demo: demo,
            active: active,
            behaviors: (element.behaviors || []).map(function(be){ return be.is; })
          });
        }, function(err, output) {
          done(err, output);
        });

      });
    }),

    // Convert to objects from arrays (and flatten),
    // and sort
    stream.create(
      function (chunk, enc, done) {

        data.push(chunk);
        done();
      },
      function (done) {

        var sortedData = _(data)
          .flatten()
          .sortBy('name')
          .value();

        this.push(sortedData);
        done();
      }
    )
  );
}
