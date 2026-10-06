/** 注册 TS 解析钩子（配合 node --import ./scripts/register-ts.mjs 使用） */
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
