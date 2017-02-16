#!/usr/bin/env node

"use strict";
const async = require("marcosc-async");
const colors = require("colors");
const fsp = require("fs-promise");
const loading = require("loading-indicator");
const path = require("path");
const presets = require("loading-indicator/presets");
const r = require("requirejs");
const UglifyJS = require("uglify-js");
colors.setTheme({
  info: "green",
});

/**
 * Async function that appends the boilerplate to the generated script
 * and writes out the result. It also creates the source map file.
 *
 * @private
 * @param  {String} outPath Where to write the output to.
 * @param  {String} version The version of the script.
 * @return {Promise} Resolves when done writing the files.
 */
function appendBoilerplate(outPath, version, name) {
  return async(function*(optimizedJs, sourceMap) {
    const respecJs = `"use strict";
/* ReSpec ${version}
Created by Robin Berjon, http://berjon.com/ (@robinberjon)
Documentation: http://w3.org/respec/.
See original source for licenses: https://github.com/w3c/respec */
window.respecVersion = "${version}";
${optimizedJs}
require(['profile-${name}']);`;
    const result = UglifyJS.minify(respecJs, {
      fromString: true,
      outSourceMap: `respec-${name}.build.js.map`,
    });
    const mapPath = path.dirname(outPath) + `/respec-${name}.build.js.map`;
    const promiseToWriteJs = fsp.writeFile(outPath, result.code, "utf-8");
    const promiseToWriteMap = fsp.writeFile(mapPath, sourceMap, "utf-8");
    yield Promise.all([promiseToWriteJs, promiseToWriteMap]);
  }, Builder);
}

var Builder = {
  /**
   * Async function that gets the current version of ReSpec from package.json
   *
   * @returns {Promise<String>} The version string.
   */
  getRespecVersion: async(function*() {
    const packagePath = path.join(__dirname, "../package.json");
    const content = yield fsp.readFile(packagePath, "utf-8");
    return JSON.parse(content).version;
  }),

  /**
   * Async function runs Requirejs' optimizer to generate the output.
   *
   * using a custom configuration.
   * @param  {[type]} options [description]
   * @return {[type]}         [description]
   */
  build({ name }) {
    if (!name)  {
      throw new TypeError("name is required");
    }
    const buildPath = path.join(__dirname, "../builds");
    const outFile = `respec-${name}.js`;
    const outPath = path.join(buildPath, outFile);
    const loadingMsg = colors.info(` Generating ${outFile}. Please wait... `);
    const timer = loading.start(loadingMsg, {
      frames: presets.clock,
      delay: 1,
    });
    return async.task(function*() {
      // optimisation settings
      const buildVersion = yield this.getRespecVersion();
      const outputWritter = appendBoilerplate(outPath, buildVersion, name);
      const config = {
        baseUrl: path.join(__dirname, "../js/"),
        deps: [
          "deps/require",
        ],
        generateSourceMaps: true,
        inlineText: true,
        logLevel: 2, // Show uglify warnings and errors.
        mainConfigFile: `js/profile-${name}.js`,
        name: `profile-${name}`,
        optimize: "uglify",
        preserveLicenseComments: false,
        useStrict: true,
      };
      const promiseToWrite = new Promise((resolve, reject) => {
        config.out = (concatinatedJS, sourceMap) => {
          outputWritter(concatinatedJS, sourceMap)
            .then(resolve)
            .catch(reject);
        };
      });
      r.optimize(config);
      const buildDir = path.resolve(__dirname, "../builds/");
      const workerDir = path.resolve(__dirname, "../worker/");
      //console.log(buildDir, workerDir);
      yield promiseToWrite;
      // copy respec-worker
      fsp
        .createReadStream(`${workerDir}/respec-worker.js`)
        .pipe(fsp.createWriteStream(`${buildDir}/respec-worker.js`));
      loading.stop(timer);
    }, this);
  },
};

exports.Builder = Builder;
