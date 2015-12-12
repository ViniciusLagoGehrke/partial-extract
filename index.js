/*
 * partial-extract
 * https://github.com/tilmanjusten/partial-extract
 *
 * Copyright (c) 2015 Tilman Justen
 * Licensed under the MIT license.
 */

'use strict';

var _ = require('lodash'),
    path = require('path'),
    fs = require('fs-extra'),
    InventoryObject = require('inventory-object'),
    PartialExtract;

PartialExtract = function (files, options) {
    var baseAbsPath, processedBlocks,
        uniqueBlocks = [];

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
        // Store inventory data as JSON file or `false` if not
        storage: './dist/partial-extract.json',
        // Enable storing partials as individual files
        storePartials: false,
        // Set indent value of partial code
        indent: '  '
    }, options);

    //console.log(chalk.white('Destination: ' + options.base));
    //console.log(chalk.white('Files: ' + files.length));

    baseAbsPath = path.resolve(options.base);
    processedBlocks = {
        options: options,
        length: 0,
        items: []
    };

    // Create destination dir if not exist
    fs.ensureDir(baseAbsPath);

    // Iterate over all specified file groups.
    files.forEach(function (file) {
        var content = fs.readFileSync(file, 'utf8'),
            blocks, resources;

        if (!options.patternExtract.test(content)) {
            //console.log(chalk.red('No partials in file ' + file));

            return;
        }

        blocks = content.match(options.patternExtract);
        resources = getResources(content);

        // Put resources to the options
        options.resources = options.resources ? _.assign({}, resources, options.resources) : resources;

        //console.log(chalk.green('Found ' + blocks.length + ' partials in file ' + file));

        // Write blocks to separate files
        blocks.map(function (block) {
            // Init inventory object
            var opts = _.assign({}, options),
                processed = new InventoryObject(),
                isDuplicate = false,
                partialPath = path.resolve(options.base, options.partials, processed.id);

            // Process block
            processed.parseData(block, opts);
            processed.setProperty('origin', file);

            processedBlocks.items.push(processed);

            if (uniqueBlocks.indexOf(processed.id) < 0) {
                uniqueBlocks.push(processed.id);
            } else {
                isDuplicate = true;
            }

            // Store partial if not already happen
            if (options.storePartials && !isDuplicate) {
                fs.writeFileSync(partialPath, processed.template, 'utf8');
            }
        });
    });

    processedBlocks.lengthUnique = uniqueBlocks.length;
    processedBlocks.lengthTotal = processedBlocks.items.length;

    // Assume string is file path, so store data as JSON file
    if (options.storage && typeof options.storage === 'string') {
        fs.ensureDir(path.dirname(options.storage));
        fs.writeJsonSync(options.storage, processedBlocks);
    }

    //console.log(chalk.green('Extracted ' + processedBlocks.length + ' partials, ' + uniqueBlocks.length + ' unique.'));

    return processedBlocks;
};

/**
 * Extract resource path of
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
    var head = src.match(/<head((.|\n)*)<\/head>/i)[1],
        body = src.match(/<body((.|\n)*)<\/body>/i)[1],
        rootClassnames = src.match(/<html.+class="([^"]*)">/i),
        bodyClassnames = src.match(/<body.+class="([^"]*)">/i),
        data;

    // Defaults
    data = {
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
        // Stylesheet resources
        data.stylesHead.files = getStylesheetResources(head);

        // Inline styles
        data.stylesHead.inline = getInlineStyles(head);

        // Script resources
        data.scriptsHead.files = getScriptResources(head);

        // Inline scripts, get script tags without src: <script> or <script type="xyz">, lazy mode
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
 * Get paths of stylesheet resources
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
 * Get inline styles
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
 * Get paths of script resources
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
 * Get inline scripts
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
