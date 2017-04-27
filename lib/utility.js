var Fs = require('fs');
var Os = require('os');
var Rimraf = require('rimraf');

module.exports = class Utility {
  static mkdtemp() {
    return new Promise((resolve, reject) => {
      Fs.mkdtemp('/tmp/compose_reactor-', (error, folder) => {
        if (error) return reject(error);

        resolve(folder);
      });
    });
  }

  static rimraf(path) {
    return new Promise((resolve, reject) => {
      Rimraf(path, error => {
        if (error) return reject(error);

        resolve(error);
      });
    });
  }

  static readFile(path, options = {}) {
    return new Promise((resolve, reject) => {
      Fs.readFile(path, options, (error, data) => {
        if (error) return reject(error);

        resolve(data);
      });
    });
  }

  static writeFile(path, data, options = {}) {
    return new Promise((resolve, reject) => {
      Fs.writeFile(path, data, options, (error) => {
        if (error) return reject(error);

        resolve();
      });
    });
  }
};
