/*
 * partial-extract
 * https://github.com/tilmanjusten/partial-extract
 *
 * Copyright (c) 2015 Tilman Justen
 * Licensed under the MIT license.
 */

'use strict';

var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var chalk = require('chalk');
var options = {};
var InventoryObject = require('inventory-object');

var PartialExtract = function (files, _options) {
    // Merge task-specific and/or target-specific options with these defaults.
    options = _.assign({
        // Find partials by pattern:
        //
        // <!-- extract:individual-file.html optional1:value optional2:value1:value2 -->
        //   partial
        // <!-- endextract -->
        patternExtract: new RegExp(/<!--\s*extract:(.|\n)*?endextract\s?-->/g),
        // Wrap partial in template element and add options as data attributes
        templateWrap: {
            before: '<template id="partial" {{wrapData}}>',
            after: '</template>'
        },
        // Wrap component for viewing purposes: e.g. add production context
        //
        // <!-- extract:individual-file.html wrap:<div class="context">:</div> -->
        //   partial
        // <!-- endextract -->
        //
        // results in
        //
        // <div class="context">
        //   partial
        // </div>
        viewWrap: {
            before: '',
            after: ''
        },
        // Base directory
        base: './dist',
        // Partial directory where individual partial files will be stored (relative to base)
        partials: './partials',
        // Store inventory data as JSON file
        storage: './dist/partial-extract.json',
        // Enable storing partials as individual files
        storePartials: false,
        // Set indent value of partial code
        indent: '    '
    }, _options);

    console.log(chalk.white('Destination: ' + options.base));
    console.log(chalk.white('Files: ' + files.length));
    console.log('');

    // Create destination dir
    var baseAbsPath = path.resolve(options.base);

    try {
        fs.accessSync(baseAbsPath, fs.R_OK);
    } catch (err) {
        console.log(chalk.green('Create base directory: %s'), options.base);
        fs.mkdirSync(baseAbsPath);
    }

    var processedBlocks = {
        options: options,
        length: 0,
        items: []
    };
    var uniqueBlocks = [];

    // Iterate over all specified file groups.
    files.forEach(function (file) {
        var content = fs.readFileSync(file, 'utf8');

        if (!options.patternExtract.test(content)) {
            console.log(chalk.red('No partials in file ' + file));
            console.log('');

            return;
        }

        var blocks = getPartials(content);
        var resources = getResources(content);

        // put resources to the options
        options.resources = options.resources ? _.assign({}, resources, options.resources) : resources;

        console.log(chalk.green('Found ' + blocks.length + ' partials in file ' + file));

        // Write blocks to separate files
        blocks.map(function (block) {
            // init inventory object
            var opts = _.assign({}, options);
            var processed = new InventoryObject();
            var isDuplicate = false;

            // process block
            processed.parseData(block, opts);
            processed.setProperty('origin', file);

            processedBlocks.items.push(processed);

            if (uniqueBlocks.indexOf(processed.id) < 0) {
                uniqueBlocks.push(processed.id);
            } else {
                isDuplicate = true;
            }

            // store partial if not already happen
            if (options.storePartials && !isDuplicate) {
                fs.writeFileSync(path.resolve(options.base, options.partials, processed.id), processed.template, 'utf8');
            }
        });

        console.log('');
    });

    processedBlocks.lengthUnique = uniqueBlocks.length;
    processedBlocks.lengthTotal = processedBlocks.items.length;

    fs.writeFileSync(options.storage, JSON.stringify(processedBlocks, null, '\t'), 'utf8');

    console.log('');

    console.log(chalk.green('Extracted ' + processedBlocks.length + ' partials, ' + uniqueBlocks.length + ' unique.'));
};

/**
 * extract partials
 *
 * @param src
 * @returns {Array}
 */
function getPartials(src) {
    return src.match(options.patternExtract);
}

/**
 * extract resource path of
 * - javascript resources in <head> and <body>
 * - stylesheet resources in <head>
 * - <style> in <head>
 * - <meta> in <head>
 * - classnames of <body>
 * - classnames of <html>
 *
 * @param src
 */
function getResources(src) {
    var head = src.match(/<head((.|\n)*)<\/head>/i)[1];
    var body = src.match(/<body((.|\n)*)<\/body>/i)[1];
    var rootClassnames = src.match(/<html.+class="([^"]*)">/i);
    var bodyClassnames = src.match(/<body.+class="([^"]*)">/i);

    // defaults
    var data = {
        classnames: {
            root: rootClassnames && rootClassnames.length ? rootClassnames[1] : '',
            body: bodyClassnames && bodyClassnames.length ? bodyClassnames[1] : ''
        },
        meta: [],
        scriptsFoot: {
            files: [],
            inline: []
        },
        scriptsHead: {
            files: [],
            inline: []
        },
        stylesHead: {
            files: [],
            inline: []
        }
    };

    // <head> section
    if (head && head.length > 0) {
        // stylesheet resources
        data.stylesHead.files = getStylesheetResources(head);

        // inline styles
        data.stylesHead.inline = getInlineStyles(head);

        // script resources
        data.scriptsHead.files = getScriptResources(head);

        // inline scripts, get script tags without src: <script> or <script type="xyz">, lazy mode
        data.scriptsHead.inline = getInlineScripts(head);

        // <meta>
        data.meta = head.match(/<meta[^>]+>/ig);
    }

    // <body> section
    if (body && body.length) {
        data.scriptsFoot.files = getScriptResources(body);
        data.scriptsFoot.inline = getInlineScripts(body);
    }

    return data;
}

/**
 * get paths of stylesheet resources
 *
 * @param src
 * @returns {Array}
 */
function getStylesheetResources(src) {
    var resources = src.match(/<link.+rel="stylesheet".*>/gi);

    if (!resources || (resources && resources.length < 1)) {
        return [];
    }

    return resources.map(function (match) {
        return match.match(/href="([^"]+)"/i)[1];
    });
}

/**
 * get inline styles
 *
 * @param src
 * @returns {Array}
 */
function getInlineStyles(src) {
    var resources = src.match(/<style[^>]*?>((.|\n)*?)<\/style>/gi);

    if (!resources || (resources && resources.length < 1)) {
        return [];
    }

    return resources.map(function (match) {
        return match.match(/<style[^>]*>((.|\n)*)<\/style>/i)[1];
    });
}

/**
 * get paths of script resources
 *
 * @param src
 * @returns {Array}
 */
function getScriptResources(src) {
    var resources = src.match(/<script.+src=".*>/gi);

    if (!resources || (resources && resources.length < 1)) {
        return [];
    }

    return resources.map(function (match) {
        return match.match(/src="([^"]+)"/i)[1];
    });
}

/**
 * get inline scripts
 *
 * @param src
 * @returns {Array}
 */
function getInlineScripts(src) {
    var resources = src.match(/<script(?:.+type="[^"]+")?>((.|\n)*?)<\/script>/gi);

    if (!resources || (resources && resources.length < 1)) {
        return [];
    }

    return resources.map(function (match) {
        return match.match(/<script[^>]*>((.|\n)*)<\/script>/i)[1];
    });
}


module.exports = PartialExtract;
