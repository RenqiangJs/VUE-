/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 编译器的创建者：createCompiler
// 编译器创建者的创建者：createCompilerCreator
/* 在不同的平台下baseCompile里面的代码是不一样的。可以看src/server/optimizing-compiler/index,generate与optimize均是服务端下面相关文件了
   但是createCompilerCreator是用一个引用，这样做是将公共逻辑抽离到createCompilerCreator，在createCompilerCreator里面再次整合，返回真正的
   编译器创建者createCompiler函数，createCompiler函数在src/platforms/web/compiler/index.js执行，返回的compile函数是字符串形式的
   代码，生成的compileToFunctions才是真正可执行的代码
   在createCompiler执行的时候，由于调用createCompilerCreator时，传入的baseCompile不同，导致createCompiler内部compile方法调用baseCompile生成的
   内容也不一样，如此一来，createCompileToFunctionFn(compile)的返回值也会因平台而异，是一个连锁反应
*/
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 将template解析成抽象语法树ast
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  // 根据生产的ast生成最终平台所需要的代码
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
