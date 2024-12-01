/*
 * Copyright 2023 Comcast Cable Communications Management, LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url'
import generateBMFont from 'msdf-bmfont-xml';

let fontSrcDir: string = '';
let fontDstDir: string = '';
let overridesPath = '';
let charsetPath = '';

interface PresetsData {
  [key : string]: string | undefined
}

let presets: PresetsData

/**
 * Set the paths for the font source and destination directories.
 *
 * @param srcDir
 * @param dstDir
 * @param charsetFilePath
 */
export function setGeneratePaths(srcDir: string, dstDir: string, charsetFilePath?: string ) {
  fontSrcDir = srcDir;
  fontDstDir = dstDir;
  overridesPath = path.join(fontSrcDir, 'overrides.json');
  charsetPath = charsetFilePath ? charsetFilePath : path.join(fontSrcDir, 'charset.config.json');
  presets = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'presets.json'), 'utf8'))
}

export interface SdfFontInfo {
  fontName: string;
  fieldType: 'ssdf' | 'msdf';
  fontPath: string;
  jsonPath: string;
  pngPath: string;
  dstDir: string;
}

type FontOptions = {
  fieldType: string;
  outputType: 'json';
  roundDecimal: number;
  smartSize: boolean;
  pot: boolean;
  textureSize: number[];
  fontSize: number;
  distanceRange: number;
  charset?: string;
}

interface CharsetConfig{
  charset: string,
  presets: string[]
}

/**
 * Generates a font file in the specified field type.
 * @param fontFileName - The name of the font.
 * @param fieldType - The type of the font field (msdf or ssdf).
 * @returns {Promise<void>} - A promise that resolves when the font generation is complete.
 */
export async function genFont(fontFileName: string, fieldType: 'ssdf' | 'msdf'): Promise<SdfFontInfo | null> {
  console.log(chalk.blue(`Generating ${fieldType} font from ${chalk.bold(fontFileName)}...`));
  if (fieldType !== 'msdf' && fieldType !== 'ssdf') {
    console.log(`Invalid field type ${fieldType}`);
    return null
  }
  const fontPath = path.join(fontSrcDir, fontFileName);
  if (!fs.existsSync(fontPath)) {
    console.log(`Font ${fontFileName} does not exist`);
    return null
  }

  let bmfont_field_type: string = fieldType;
  if (bmfont_field_type === 'ssdf') {
    bmfont_field_type = 'sdf';
  }

  const fontNameNoExt = fontFileName.split('.')[0]!;
  const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
  const font_size = overrides[fontNameNoExt]?.[fieldType]?.fontSize || 42;
  const distance_range =
    overrides[fontNameNoExt]?.[fieldType]?.distanceRange || 4;
  const extra_presets = overrides[fontNameNoExt]?.[fieldType]?.presets || [];

  let options: FontOptions = {
    fieldType: bmfont_field_type,
    outputType: 'json',
    roundDecimal: 6,
    smartSize: true,
    pot: false,
    textureSize: [2048, 2048],
    fontSize: font_size,
    distanceRange: distance_range,
  }

  if (fs.existsSync(charsetPath)) {
    const config:CharsetConfig =  JSON.parse(fs.readFileSync(charsetPath, 'utf8'))
    let charset = config.charset
    const presetsToApply = config.presets.concat(extra_presets);
    for (let i = 0; i < presetsToApply.length; i++ ){
      const key = presetsToApply[i]
      if (key && key in presets)  {
        charset += presets[key]
      } else {
        console.warn(`preset, '${key}' is not available in msdf-generator presets`)
      }
    }
    options['charset'] = charset
  }

  await generateFont(fontPath, fontDstDir, fontNameNoExt, fieldType, options)

  const info: SdfFontInfo = {
    fontName: fontNameNoExt,
    fieldType,
    jsonPath: path.join(fontDstDir, `${fontNameNoExt}_${fieldType}.json`),
    pngPath: path.join(fontDstDir, `${fontNameNoExt}_${fieldType}.png`),
    fontPath,
    dstDir: fontDstDir,
  };

  return info;
}

const generateFont = (fontSrcPath: string, fontDestPath: string, fontName: string, fieldType: string, options: FontOptions): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(fontDestPath)) {
      fs.mkdirSync(fontDestPath, { recursive: true })
    }
    generateBMFont(
      fontSrcPath,
      options,
      (err, textures, font) => {
        if (err) {
          console.error(err)
          reject(err)
        } else {
          let i = 0;
          textures.forEach((texture: any) => {
            try {
              fs.writeFileSync(path.resolve(fontDestPath, `${fontName}_${fieldType}_${i++}.png`), texture.texture)
            } catch (e) {
              console.error(e)
              reject(e)
            }
          })
          try {
            fs.writeFileSync(path.resolve(fontDestPath, `${fontName}_${fieldType}.json`), font.data)
            resolve()
          } catch (e) {
            console.error(err)
            reject(e)
          }
        }
      }
    )
  })
}
