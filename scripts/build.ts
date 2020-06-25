import fs from 'fs-extra';
import { join, basename } from 'path';
import Svgo from 'svgo';


async function build(rootDir: string) {
  try {
    const pkgJsonPath = join(rootDir, 'package.json');
    const srcDir = join(rootDir, 'src');
    const srcSvgDir = join(srcDir, 'svg');
    const iconDir = join(rootDir, 'icons');
    const distDir = join(rootDir, 'dist');
    const distGriconsDir = join(distDir, 'gricons');
    const destSrcSvgDir = join(distDir, 'svg');

    await Promise.all([
      fs.emptyDir(iconDir),
      fs.emptyDir(distDir),
      fs.emptyDir(destSrcSvgDir),
    ]);
    await fs.emptyDir(distGriconsDir);

    const pkgData = await fs.readJson(pkgJsonPath);
    const version = pkgData.version as string;

    const srcSvgData = await getSvgs(srcSvgDir, rootDir, distGriconsDir)

    await optimizeSvgs(srcSvgData);

    await Promise.all([
      createDataJson(version, srcDir, distDir, srcSvgData),
      createIconPackage(version, iconDir, srcSvgData),
    ]);

    const svgSymbolsContent = await createSvgSymbols(version, distDir, srcSvgData)

    await createCheatsheet(version, rootDir, distDir, svgSymbolsContent, srcSvgData);

    await copyToTesting(rootDir, distDir, srcSvgData);

    await fs.copy(srcSvgDir, destSrcSvgDir);

  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}


async function optimizeSvgs(srcSvgData: SvgData[]) {
  // https://github.com/svg/svgo
  const optimizePass = new Svgo({});
  const processPass = new Svgo({
    full: true,
    plugins: [
      {
        replaceTitleText: {
          type: 'perItem',
          fn: (item, params, extra) => {
            if (item.isElem('title')) {
              const fileName = basename(extra.path)
                .replace('.svg', '')
                .replace(/-/g, ' ');
              item.content[0].text = fileName;
            }
            return item;
          }
        }
      } as any,
      {
        addClassesToSVGElement: {
          className: ['gricon']
        }
      },
      {
        removeStyleElement: true
      },
      {
        removeScriptElement: true
      },
      {
        removeDimensions: true
      }
    ]
  });

  const validatePass = new Svgo({
    full: true,
    plugins: [
      {
        addFillNoneCss: {
          type: 'perItem',
          fn: (item, params) => {
            if (!Array.isArray(params.attrs)) {
              params.attrs = [params.attrs];
            }
            if (item.isElem()) {
              item.eachAttr(attr => {
                if (attr.name === 'style') {
                  throw new Error('Inline style detected');
                }
              });
            }
          }
        }
      } as any
    ]
  });

  await Promise.all(srcSvgData.map(async svgData => {
    return optimizeSvg(optimizePass, processPass, validatePass, svgData);
  }));
}


async function optimizeSvg(pass1: Svgo, pass2: Svgo, validatePass: Svgo, svgData: SvgData) {
  const srcSvgContent = await fs.readFile(svgData.srcFilePath, 'utf8');

  const optimizedSvg = await pass1.optimize(srcSvgContent, { path: svgData.srcFilePath });
  const processedSvg = await pass2.optimize(optimizedSvg.data, { path: svgData.srcFilePath });

  svgData.optimizedSvgContent = processedSvg.data;

  try {
    await validatePass.optimize(svgData.optimizedSvgContent, { path: svgData.srcFilePath });
  } catch (e) {
    console.error(`${e.message}: ${svgData.srcFilePath}`);
  }

  await fs.writeFile(svgData.optimizedFilePath, svgData.optimizedSvgContent);
}


async function copyToTesting(rootDir: string, distDir: string, srcSvgData: SvgData[]) {
  const testDir = join(rootDir, 'www');
  const testBuildDir = join(testDir, 'build');
  const testSvgDir = join(testBuildDir, 'svg');
  await fs.ensureDir(testSvgDir);

  await Promise.all(srcSvgData.map(async svgData => {
    const testSvgFilePath = join(testSvgDir, svgData.fileName);
    await fs.writeFile(testSvgFilePath, svgData.optimizedSvgContent);
  }));

  const distCheatsheetFilePath = join(distDir, 'cheatsheet.html');
  const testCheatsheetFilePath = join(testDir, 'cheatsheet.html');
  await fs.copyFile(distCheatsheetFilePath, testCheatsheetFilePath);
}


async function createSvgSymbols(version: string, distDir: string, srcSvgData: SvgData[]) {
  srcSvgData = srcSvgData.sort((a, b) => {
    if (a.iconName < b.iconName) return -1;
    if (a.iconName > b.iconName) return 1;
    return 0;
  });

  const symbolsSvgFilePath = join(distDir, 'gricons.symbols.svg');

  const lines = [
    `<svg data-gricons="${version}" style="display:none">`
  ];

  srcSvgData.forEach(svgData => {
    const svg = svgData.optimizedSvgContent
      .replace(
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        `<symbol id="${svgData.iconName}"`
      )
      .replace(
        `</svg>`,
        `</symbol>`
      )
      lines.push(svg);
  });

  lines.push(
    `</svg>`,
    ``
  );

  const content = lines.join('\n');

  await fs.writeFile(symbolsSvgFilePath, content);

  return content;
}


async function createCheatsheet(version: string, rootDir: string, distDir: string, svgSymbolsContent: string, srcSvgData: SvgData[]) {
  const CheatsheetTmpFilePath = join(rootDir, 'scripts', 'cheatsheet-template.html');
  const distCheatsheetFilePath = join(distDir, 'cheatsheet.html');

  const c = srcSvgData.map(svgData => (
    `<div class="item">
      <gr-icon name="${svgData.iconName}"></gr-icon>
      <div class="caption">${svgData.iconName}</div>
    </div>`
  ));

  c.push(svgSymbolsContent);

  const html = (await fs.readFile(CheatsheetTmpFilePath, 'utf8'))
    .replace(/{{version}}/g, version)
    .replace(/{{count}}/g, srcSvgData.length.toString())
    .replace(/{{content}}/g, c.join('\n'));

  await fs.writeFile(distCheatsheetFilePath, html);
}


async function getSvgs(srcSvgDir: string, rootDir: string, distGriconsDir: string): Promise<SvgData[]> {
  const optimizedSvgDir = join(distGriconsDir, 'svg');
  await fs.emptyDir(optimizedSvgDir);

  const svgFiles = (await fs.readdir(srcSvgDir)).filter(fileName => {
    return !fileName.startsWith('.') && fileName.endsWith('.svg');
  });

  const svgData = await Promise.all(svgFiles.map(async fileName => {
    // fileName: airplane-outline.svg

    if (fileName.toLowerCase() !== fileName) {
      throw new Error(`svg filename "${fileName}" must be all lowercase`);
    }

    // srcFilePath: /src/svg/airplane-outline.svg
    const srcFilePath = join(srcSvgDir, fileName);

    // optimizedFilePath: /dist/gricons/svg/airplane-outline.svg
    const optimizedFilePath = join(optimizedSvgDir, fileName);

    const dotSplit = fileName.split('.');
    if (dotSplit.length > 2) {
      throw new Error(`svg filename "${fileName}" cannot contain more than one period`);
    }

    // iconName: airplane-outline
    const iconName = dotSplit[0];

    if (reservedKeywords.has(iconName)) {
      throw new Error(`svg icon name "${iconName}" is a reserved JavaScript keyword`);
    }

    // fileNameMjs: airplane-outline.mjs
    const fileNameMjs = iconName + '.mjs';

    // fileNameCjs: airplane-outline.mjs
    const fileNameCjs = iconName + '.js';

    // exportName: airplaneOutline
    const exportName = camelize(iconName);

    return {
      fileName,
      srcFilePath,
      srcSvgContent: (await fs.readFile(srcFilePath, 'utf8')),
      optimizedFilePath,
      optimizedSvgContent: null,
      iconName,
      fileNameMjs,
      fileNameCjs,
      exportName,
    }
  }));

  return svgData.sort((a, b) => {
    if (a.exportName < b.exportName) return -1;
    if (a.exportName > b.exportName) return 1;
    return 0;
  });
}


async function createIconPackage(version: string, iconDir: string, srcSvgData: SvgData[]) {
  const iconPkgJsonFilePath = join(iconDir, 'package.json');

  await Promise.all([
    createEsmIcons(version, iconDir, srcSvgData),
    createCjsIcons(version, iconDir, srcSvgData),
    createDtsIcons(version, iconDir, srcSvgData),
  ]);

  const iconPkgJson = {
    name: "gricons/icons",
    version,
    module: "index.mjs",
    main: "index.js",
    typings: "index.d.ts",
    private: true
  };

  const jsonStr = JSON.stringify(iconPkgJson, null, 2) + '\n';
  await fs.writeFile(iconPkgJsonFilePath, jsonStr);
}


async function createEsmIcons(version: string, iconDir: string, srcSvgData: SvgData[]) {
  const iconEsmFilePath = join(iconDir, 'index.mjs');

  const o = [
    `/* Gricons v${version}, ES Modules */`, ``
  ];

  srcSvgData.forEach(svgData => {
    o.push(`export const ${svgData.exportName} = ${getDataUrl(svgData)}`);
  });

  await fs.writeFile(iconEsmFilePath, o.join('\n') + '\n');
}


async function createCjsIcons(version: string, iconDir: string, srcSvgData: SvgData[]) {
  const iconCjsFilePath = join(iconDir, 'index.js');

  const o = [
    `/* Gricons v${version}, CommonJS */`, ``
  ];

  srcSvgData.forEach(svgData => {
    o.push(`exports.${svgData.exportName} = ${getDataUrl(svgData)}`);
  });

  await fs.writeFile(iconCjsFilePath, o.join('\n') + '\n');
}


async function createDtsIcons(version: string, iconDir: string, srcSvgData: SvgData[]) {
  const iconDtsFilePath = join(iconDir, 'index.d.ts');

  const o = [
    `/* Gricons v${version}, Types */`, ``
  ];

  srcSvgData.forEach(svgData => {
    o.push(`export declare var ${svgData.exportName}: string;`);
  });

  await fs.writeFile(iconDtsFilePath, o.join('\n') + '\n');
}


function getDataUrl(svgData: SvgData) {
  let svg = svgData.optimizedSvgContent;
  if (svg.includes(`'`)) {
    throw new Error(`oh no! no single quotes allowed! ${svgData.fileName}`);
  }
  if (svg.includes(`\n`) || svg.includes(`\r`)) {
    throw new Error(`oh no! no new lines allowed! ${svgData.fileName}`);
  }
  svg = svg.replace(/"/g, "'");
  return `"data:image/svg+xml;utf8,${svg}"`;
}


async function createDataJson(version: string, srcDir: string, distDir: string, srcSvgData: SvgData[]) {
  const srcDataJsonPath = join(srcDir, 'data.json');
  const distDataJsonPath = join(distDir, 'gricons.json');

  let data: JsonData;

  try {
    data = await fs.readJson(srcDataJsonPath);
  } catch (e) {
    data = {} as any;
  }

  data.icons = data.icons || [];

  // add new icons
  srcSvgData.forEach(svgData => {
    if (!data.icons.some(i => i.name === svgData.iconName)) {
      data.icons.push({
        name: svgData.iconName
      });
    }
  });

  // remove dead icons
  data.icons = data.icons.filter(dataIcon => {
    return srcSvgData.some(svgData => dataIcon.name === svgData.iconName);
  });

  // sort
  data.icons = data.icons.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0
  });
  data.icons.forEach(icon => {
    icon.tags = icon.tags || icon.name.split('-');
    icon.tags = icon.tags.sort();
  });

  const srcJsonStr = JSON.stringify(data, null, 2) + '\n';
  await fs.writeFile(srcDataJsonPath, srcJsonStr);

  const distJsonData = {
    name: 'gricons',
    version,
    icons: data.icons
  };
  const distJsonStr = JSON.stringify(distJsonData, null, 2) + '\n';
  await fs.writeFile(distDataJsonPath, distJsonStr);
}


function camelize(text: string) {
  let words = text.split(/[-_]/g); // ok one simple regexp.
  return words[0].toLowerCase() + words.slice(1).map(upFirst).join('');
}


function upFirst(word: string) {
  return word[0].toUpperCase() + word.toLowerCase().slice(1);
}


interface SvgData {
  /**
   * airplane-outline.svg
   */
  fileName: string;

  /**
   * /src/svg/airplane-outline.svg
   */
  srcFilePath: string;

  /**
   * /dist/gricons/svg/airplane-outline.svg
   */
  optimizedFilePath: string;

  srcSvgContent: string;
  optimizedSvgContent: string;

  /**
   * airplane-outline
   */
  iconName: string;

  /**
   * airplane-outline.mjs
   */
  fileNameMjs: string;

  /**
   * airplane-outline.js
   */
  fileNameCjs: string;

  /**
   * airplaneOutline
   */
  exportName: string;
}

interface JsonData {
  icons: { name: string; tags?: string[]; } [];
  version?: string;
}

// https://mathiasbynens.be/notes/reserved-keywords
const reservedKeywords = new Set([
  'do',
  'if',
  'in',
  'for',
  'let',
  'new',
  'try',
  'var',
  'case',
  'else',
  'enum',
  'eval',
  'null',
  'this',
  'true',
  'void',
  'with',
  'await',
  'break',
  'catch',
  'class',
  'const',
  'false',
  'super',
  'throw',
  'while',
  'yield',
  'delete',
  'export',
  'import',
  'public',
  'return',
  'static',
  'switch',
  'typeof',
  'default',
  'extends',
  'finally',
  'package',
  'private',
  'continue',
  'debugger',
  'function',
  'arguments',
  'interface',
  'protected',
  'implements',
  'instanceof',
]);


// let's do this
build(join(__dirname, '..'));
