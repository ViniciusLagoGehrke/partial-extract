'use strict';

var PE = require('./index');

var files = [
    'examples/sample-document.html'
];

var pe = new PE(files, {
    force: true,
    base: './dist/',
    storage: './dist/interface-inventory.json',
    //partialWrap: false,
    //flatten: true,
    storePartials: false,
    partials: 'partials/'
});
