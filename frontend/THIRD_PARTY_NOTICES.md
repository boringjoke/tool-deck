# 第三方依赖许可说明

## opencc-js 1.4.2

本项目的「中文简体繁体转换」工具使用 `opencc-js@1.4.2`，来源于：

- 项目仓库：https://github.com/nk2028/opencc-js
- npm 包：https://www.npmjs.com/package/opencc-js

`opencc-js` 的包许可元数据为 MIT AND Apache-2.0。其构建产物内包含由 `opencc-data@1.4.2` 生成的 OpenCC 词库数据；该词库数据来源于 OpenCC 项目并按 Apache-2.0 再分发。

相关项目：

- OpenCC：https://github.com/BYVoid/OpenCC
- opencc-data：https://www.npmjs.com/package/opencc-data

完整许可文本随 npm 依赖包中的 `LICENSE`、`LICENSES/Apache-2.0.txt` 和 `THIRD_PARTY_LICENSES.md` 提供。项目发布或重新分发前，应继续保留上述来源和许可说明。

## qrcode 1.5.4

本项目的「二维码生成」工具使用 `qrcode@1.5.4` 在浏览器本地生成 SVG 预览和 PNG 导出，来源于：

- 项目仓库：https://github.com/soldair/node-qrcode
- npm 包：https://www.npmjs.com/package/qrcode

`qrcode` 的包许可元数据为 MIT。该依赖随前端构建产物本地提供，不通过 CDN、在线接口或运行时下载获取。

## @types/qrcode 1.5.6

本项目使用 `@types/qrcode@1.5.6` 提供 TypeScript 类型声明，来源于：

- 项目仓库：https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/qrcode
- npm 包：https://www.npmjs.com/package/@types/qrcode

`@types/qrcode` 的包许可元数据为 MIT；该包仅用于开发期类型检查，不进入运行时构建产物。

## jsbarcode 3.12.3

本项目的「条形码生成」工具使用 `jsbarcode@3.12.3` 在浏览器本地生成 CODE128、CODE39、EAN/UPC 等确认码制的 SVG 预览和 Canvas/PNG 导出，来源于：

- 项目仓库：https://github.com/lindell/JsBarcode
- npm 包：https://www.npmjs.com/package/jsbarcode

`jsbarcode` 的包许可元数据为 MIT，发布包未解包体积约 618 KB，自带 `jsbarcode.d.ts` 类型声明。该依赖随条形码工具的前端构建产物本地按需提供，不通过 CDN、在线接口或运行时下载获取。
