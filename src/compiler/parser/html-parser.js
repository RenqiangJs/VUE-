/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// 匹配标签的属性(attributes)的
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 用来匹配开始标签的 < 以及标签的名字，但是并不包括开始标签的闭合部分
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 捕获开始标签结束部分的斜杠：/
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)  // 用来匹配结束标签
const doctype = /^<!DOCTYPE [^>]+>/i   // 匹配文档的 DOCTYPE 标签，没有捕获组。
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/   // 匹配注释节点，没有捕获组
const conditionalComment = /^<!\[/     // 匹配条件注释节点，没有捕获组

// Special Elements (can contain anything)
// isPlainTextElement 常量是一个函数，它是通过 makeMap 函数生成的， 用来检测给定的标签是不是纯文本标签
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'
/* 
  decodeAttr 函数是用来解码 html 实体的。它的原理是利用前面的正则 encodedAttrWithNewLines 
  和 encodedAttr 以及 html 实体与字符一一对应的 decodingMap 对象来实现将 html 实体转为对应的字符
*/
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) { 
  // stack和lastTag都是为了判断是否缺少闭合标签而存在的
  const stack = []  // 存储
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  // 能否省略闭合标签的非一元标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last,   // 存储还未parse的html
      lastTag // 存储stack栈顶的元素
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    /* 条件取反 lastTag && isPlainTextElement(lastTag) 
        取反后的条件就好理解多了，我们知道 lastTag 存储着 stack 栈顶的元素，而 stack 栈顶的元素应该
        就是 最近一次遇到的非一元标签的开始标签，所以以上条件为真等价于：最近一次遇到的非一元标签是纯文
        本标签(即：script,style,textarea 标签)。也就是说：当前我们正在处理的是纯文本标签里面的内容。
        那么现在就清晰多了，当处理纯文本标签里面的内容时，就会执行 else 分支，其他情况将执行 if 分支
    */
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // textEnd保存着 ‘<’第一次出现的位置
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        // 可能是注释节点，因为注释节点要以‘<!--’开始,还得以‘-->’结束才算是注释节点
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              // 调用substring截取注释内容，不包含 ‘<!--’
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 将尾部的‘-->’截取掉，并更新index的值
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 可能是 条件注释节点，因为条件注释节点除了要以 <![ 开头还必须以 ]> 结尾
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')
          // vue不会保存条件注释节点，所以是直接截取，并更新index
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 原则上vue不会碰见doctype节点，了解即可
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 可能是结束标签 </div>
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 类似于"1<2<3"这段代码,
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        // while 循环的条件保证了只有截取后的字符串不能匹配标签的情况下才会执行
        // 一直找到能成功匹配到标签的<
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  function advance (n) {
    index += n
    html = html.substring(n)
  }

  function parseStartTag () {
    // 开始标签的匹配组
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      // while没有匹配到开始标签的结束部分 并且 匹配到了开始标签中的属性
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 如果匹配到了开始标签的结束部分
      /*
        <br />   end:['/>', '/']
        <div>    ebd:['>', undefined]
      */
      if (end) {
        // end[1]有值说明是一元标签
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }
    /* unary的值是一个布尔值，为真时代表着标签是一元标签，否则是二元标签
       isUnaryTag 函数能够判断标准 HTML 中规定的那些一元标签 || 
       开始标签的结束部分是否使用 '/'，如果有反斜线 '/'，说明这是一个一元标签
    */
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    /*
      for 循环的作用是：格式化 match.attrs 数组，并将格式化后的数据存储到常量 attrs 中。格式
      化包括两部分，第一：格式化后的数据只包含 name 和 value 两个字段，其中 name 是属性名，value 
      是属性的值。第二：对属性值进行 html 实体的解码
    */
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      // 浏览器怪癖做兼容处理
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }
    // 将非一元标签的信息推入stack中
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }
    // parseHTML传递的start方法
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }
  /*
  parseEndTag方法的三个作用:
    1.检测是否缺少闭合标签
    2.处理 stack 栈中剩余的标签
    3.解析 </br> 与 </p> 标签，与浏览器的行为相同
  */
  function parseEndTag (tagName, start, end) {
    // pos变量用来判断是否有元素缺少闭合标签
    let pos, lowerCasedTagName
    // 当不传递start,end这两个参数的时候
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      // 寻找当前解析标签在stack里面的位置
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }
    /*
      pos小于0的情况，说明结束标签tagname没有在stack里面找到对应的开始标签，也就是说只写了结束标签没写开始标签
    */
    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 再次从后向前遍历stack，如果stack存在索引大于pos的元素，该元素一定缺少闭合标签
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
