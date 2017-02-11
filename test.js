'use strict';

var partialExtract = require('./index');

var files = [
    'examples/nested-partials-simple.html',
    'examples/no-nested-partials.html',
    'examples/nested-partials.html',
    'examples/sample-document.html'
];

function callback (err, data) {
    if (err) {
        console.log("An error occured: ");
        console.log(err);

        return;
    }

    console.log("Partial extract data:");
    console.log(data);
}

partialExtract(files, {
    force: true,
    base: './dist/',
    storage: './dist/interface-inventory.json',
    //partialWrap: false,
    //flatten: true,
    storePartials: false,
    partials: 'partials/'
}, callback);
