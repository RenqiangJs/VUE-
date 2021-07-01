/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'
// 创建编译器的时候传递了基本配置项baseOptions，src/platforms/web/entry-runtime-with-compiler.js调用compileToFunctions时，又传递了编译器选项
const { compile, compileToFunctions } = createCompiler(baseOptions)
/*
    createCompiler<--createCompilerCreator(baseCompile)
*/
export { compile, compileToFunctions }
