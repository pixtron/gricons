const {promises:fs} = require('fs');
const path = require('path');

const DOMParser = require('xmldom').DOMParser;
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');

const pathSprite = './node_modules/@gyselroth/icon-collection/src/icons.svg';
const replaceDir = path.join(__dirname, '../src/replace-svg');
const buildDir = path.join(__dirname, '../src/svg');

splitSprite(pathSprite, buildDir);

async function splitSprite(pathSprite, buildDir) {
  console.log('Splitting svg sprite');
  await prepareBuildDir(buildDir);

  const replaceIcons = await readDir(replaceDir);
  const symbols = await getSymbolsFromSprite(pathSprite);

  for (i=0; i < symbols.length; i++) {
    const symbol = symbols.item(i);
    const id = symbol.getAttribute('id');
    let svgString;
    if(replaceIcons.includes(`${id}.svg`)) {
      svgString = await readFile(path.join(replaceDir, `${id}.svg`));
    } else {
      const svg = symbol.getElementsByTagName('svg')[0];

      if (svg === undefined) {
        // this is a symbol which does not contain a svg root, create svg root
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
          ${symbol.childNodes.toString()}
        </svg>`;
      } else {
        svgString = svg.toString();
      }
    }

    const outPath = path.join(buildDir, `${id}.svg`);

    await writeSvg(outPath, svgString);
  }
}

async function getSymbolsFromSprite(pathSprite) {
  const data = await fs.readFile(pathSprite, 'utf8');

  const parser = new DOMParser();
  const sprite = parser.parseFromString(data, 'image/svg+xml');
  return sprite.getElementsByTagName('symbol');
}

async function writeSvg(path, content) {
  try {
    await fs.writeFile(path, content);
  } catch(err) {
    console.error(`Could not write svg file ${path}`, err);
  }
}

async function readDir(path) {
  try {
    return await fs.readdir(path);
  } catch(err) {
    console.error(`Could not read dir ${path}`, err);
  }
}

async function readFile(path) {
  try {
    return await fs.readFile(path);
  } catch(err) {
    console.error(`Could not read file ${path}`, err);
  }
}

async function prepareBuildDir(buildDir) {
  try {
    await rmDir(buildDir);
  } catch(err) {
    // directory does not exist, so we can continue
  }

  await mkdirp(buildDir);
}

async function rmDir(buildDir) {
  return new Promise((resolve, reject) => {
    rimraf(buildDir, (err) => {
      if(err) return reject(err);

      return resolve();
    });
  });
}
