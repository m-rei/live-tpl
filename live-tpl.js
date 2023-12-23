const initTemplate = (rootNodeSelector, data) => {
    let ctx = {};

    ctx.rootNodeSelector = rootNodeSelector;
    ctx.rootNode = document.querySelector(rootNodeSelector);
    ctx.template = ctx.rootNode.outerHTML;
    ctx.data = data;
    ctx.localDataStack = [];
    ctx.fullRender = true;
    ctx.changeListeners = new Map();
    renderTemplate(ctx);

    return ctx;
}

const renderTemplate = (ctx) => {
    const TPL_FOR = 'tpl-for';
    const TPL_IF = 'tpl-if';
    const TPL_MODEL = 'tpl-model';

    const tryToResolveVarRef = (varContainer, tokens) => {
        let ret = varContainer;
        let idx = 0;
        while (idx < tokens.length) {
            const nextToken = tokens[idx];
            if (['string','number','boolean','array','object'].includes(typeof ret[nextToken])) {
                ret = ret[nextToken];
                idx++
            } else {
                break;
            }
        }
        if (ret === varContainer) {
            ret = undefined;
        }
        return {
            ret: ret,
            tokens: idx,
        }
    }

    const resolveVarRefs = (txt) => {
        let txtStringsReplacedWithWhiteSpaces = txt;
        const strRE = /(?:"[^"]*"|'[^']*')/g;
        const strMatches = [...txtStringsReplacedWithWhiteSpaces.matchAll(strRE)];
        for (let i = 0; i < strMatches.length; i++) {
            const match = strMatches[i];
            txtStringsReplacedWithWhiteSpaces = 
                txtStringsReplacedWithWhiteSpaces.substring(0, match.index) +
                ' '.repeat(match[0].length) +
                txtStringsReplacedWithWhiteSpaces.substring(match.index + match[0].length);
        }

        const re = /[a-zA-Z_$][a-zA-Z$0-9_.-]*/g;
        const varRefs = [...txtStringsReplacedWithWhiteSpaces.matchAll(re)];
        for (let i = 0; i < varRefs.length; i++) {
            let varRef = varRefs[i];
            let varTokens = varRef[0].split('.');

            let val = undefined;
            for (let j = ctx.localDataStack.length-1; j >= 0 && val?.ret === undefined; j--) {
                val = tryToResolveVarRef(ctx.localDataStack[j], varTokens);
            }
            if (val?.ret === undefined) {
                val = tryToResolveVarRef(ctx.data, varTokens);
            }

            if (val?.ret !== undefined) {
                let len = 0;
                for (let j = 0; j < val.tokens; j++) {
                    len += 1 + varTokens[j].length;
                }
                len--;

                txt = 
                    txt.substring(0, varRef.index) +
                    JSON.stringify(val.ret) + 
                    txt.substring(varRef.index + len);
            }
        }

        return txt;
    }

    const evalDoubleCurlyBraces = (txt) => {
        const doubleCurlyBracketsRegEx = /{{([^}]*)}}/g;
        const matches = [...txt.matchAll(doubleCurlyBracketsRegEx)];
        for (let i = matches.length-1; i >= 0; i--) {
            const match = matches[i];
            let matchedExpr = match[1];
            let matchedExprLen = matchedExpr.length;
            if (matchedExpr.startsWith('##')) {
                matchedExpr = atob(matchedExpr.substring(2));
            }
            const processedExpr = resolveVarRefs(matchedExpr);
            try {
                let evaledExpr = eval('(' + processedExpr + ')');
                if (typeof evaledExpr == 'object') {
                    evaledExpr = JSON.stringify(evaledExpr);
                }
                txt = txt.slice(0, match.index) + evaledExpr + txt.slice(match.index + 4 + matchedExprLen);
            } catch (ignored) {
                txt = txt.slice(0, match.index + 2) + '##' + btoa(processedExpr) + txt.slice(match.index + 2 + matchedExprLen);
            }
        }
        return txt;
    }

    const evalTplDirectives = (txt, parentLoopArrName, parentLoopVar, parentLoopIdx) => {
        const tplForRE = new RegExp(`${TPL_FOR}="([^;]*);([^"]*)`, 'g');
        const tplForArrReferencesParentLoopVarRE = new RegExp(`^${parentLoopVar}(\\.|\\[)`, 'g');
        const matches = [...txt.matchAll(tplForRE)];
        for (let i = matches.length-1; i >= 0; i--) {
            const match = matches[i];
            let matchedExpr = match[1];
            const referencesParentLoopVar = tplForArrReferencesParentLoopVarRE.test(matchedExpr.trim());
            const arrNameToInsert = referencesParentLoopVar
                ? ';##' + btoa(`${parentLoopArrName}[${parentLoopIdx}].${matchedExpr.split('.').filter((_,idx) => idx > 0).join('.')}`)
                : ';##' + btoa(matchedExpr);
            const processedExpr = '##' + btoa(resolveVarRefs(matchedExpr));
            txt = txt.slice(0, match.index + 2 + TPL_FOR.length) +
                processedExpr +
                txt.slice(match.index + 2 + TPL_FOR.length + matchedExpr.length, match.index + 2 + TPL_FOR.length + matchedExpr.length + match[2].length + 1) +
                arrNameToInsert +
                txt.slice(match.index + 2 + TPL_FOR.length + matchedExpr.length + match[2].length + 1);
        } 

        const tplIfRE = new RegExp(`${TPL_IF}="([^"]*)`, 'g'); 
        const matches2 = [...txt.matchAll(tplIfRE)];
        for (let i = matches2.length-1; i >= 0; i--) {
            const match = matches2[i];
            let matchedExpr = match[1];
            const processedExpr = resolveVarRefs(matchedExpr);
            txt = txt.slice(0, match.index + 2 + TPL_IF.length) + processedExpr + txt.slice(match.index + 2 + TPL_IF.length + matchedExpr.length);
        }

        const tplModelRE = new RegExp(`${TPL_MODEL}="([^"]*)`, 'g');
        const matches3 = [...txt.matchAll(tplModelRE)];
        for (let i = matches3.length-1; i >= 0; i--) {
            const match = matches3[i];
            let matchedExpr = match[1];
            if (matchedExpr.trim() == parentLoopVar) {
                const arrNameToInsert = `${parentLoopArrName}[${parentLoopIdx}]`;
                txt = txt.slice(0, match.index + 2 + TPL_MODEL.length) +
                    arrNameToInsert +
                    txt.slice(match.index + 2 + TPL_MODEL.length + matchedExpr.length);
            }
        }

        return txt;
    }

    const convert = (strValue, oldType) => {
        if ('number' === typeof oldType) {
            return Number(strValue);
        }
        if ('boolean' === typeof oldType) {
            return strValue.toLowerCase() == 'true' || strValue == '1' || strValue == 't' || strValue === 'y';
        }
        return strValue;
    }

    const tplModelChangeListener = (fullVarName) => {
        return (e) => {
            const newVal = e?.currentTarget?.value;
            if (!newVal) {
                return;
            }
            let base = ctx.data;
            const tokens = fullVarName.split('.');
            let i = 0;
            while (i < tokens.length) {
                const currentToken = tokens[i];
                if (currentToken.includes('[')) {
                    const currentTokenParts = currentToken.split('[');
                    base = base[currentTokenParts[0]];
                    const arrIdx = parseInt(currentTokenParts[1].substring(0, currentTokenParts[1].length - 1));
                    if (arrIdx == NaN) {
                        return;
                    }
                    if (i == tokens.length - 1) {
                        base[arrIdx] = convert(newVal, base[arrIdx]);
                        break;
                    }
                    base = base[arrIdx];
                } else {
                    if (i == tokens.length -1) {
                        base[currentToken] = convert(newVal, base[currentToken]);
                        break;
                    }
                    base = base[currentToken];
                }
                i++;
            }
            renderTemplate(ctx);
        }
    }

    const handleTplModel = (node) => {
        const namedItem = node.attributes.getNamedItem(TPL_MODEL);
        if (!namedItem) {
            return {};
        }
        try {
            const fullVarName = namedItem.value;
            node.attributes.removeNamedItem(TPL_MODEL);
            let changeListener = ctx.changeListeners.get(fullVarName);
            if (!changeListener) {
                changeListener = tplModelChangeListener(fullVarName);
                ctx.changeListeners.set(fullVarName, changeListener);
            }
            node.removeEventListener('change', changeListener);
            node.addEventListener('change', changeListener);
            node.value = eval(resolveVarRefs(fullVarName));
        } catch (e) {
            console.warn(`[${TPL_MODEL}] could not parse: ${namedItem.value}`);
        }
        return {}
    }

    const handleTplIf = (node) => {
        const namedItem = node.attributes.getNamedItem(TPL_IF);
        if (!namedItem) {
            return {};
        }
        try {
            const val = resolveVarRefs(namedItem.value);
            const evalResult = eval(val);
            node.attributes.removeNamedItem(TPL_IF);
            if (evalResult == false) {
                node.parentNode.removeChild(node);
                return {
                    nodeRemoved: true,
                }
            }
        } catch (e) {
            console.warn(`[${TPL_IF}] could not parse: ${namedItem.value}`);
        }
        return {};
    } 

    const handleTplFor = (node) => {
        const tplForAttrib = node.attributes.getNamedItem(TPL_FOR);
        if (!tplForAttrib) {
            return {};
        }
        try {
            const forValues = tplForAttrib.value.split(";");
            let forArrName = forValues[0].trim();
            if (forArrName.startsWith('##')) {
                forArrName = atob(forArrName.substring(2));
            }
            const forArr = JSON.parse(resolveVarRefs(forArrName));
            const forVar = forValues[1].trim();
            node.attributes.removeNamedItem(TPL_FOR);
            const tpl = node.outerHTML;
            const currentArrName = forValues.length >= 3
                ? atob(forValues[2].substring(2))
                : forArrName;

            for (let idx = 0; idx < forArr.length; idx++) {
                let forVal = forArr[idx];
                let stack = {};
                stack[forVar] = forVal;
                ctx.localDataStack.push(stack);
                const processedTpl = evalTplDirectives(evalDoubleCurlyBraces(tpl), currentArrName, forVar, idx);
                ctx.localDataStack.pop();

                let newNode = createVDOM(processedTpl);
                node.parentElement.insertBefore(newNode, node);
            }

            node.parentNode.removeChild(node);
            return {
                nodeRemoved: true,
            }
        } catch (e) {
            console.warn(`[${TPL_FOR}] could not parse: ${tplForAttrib.value}`);
        }
        return {};
    }

    const preProcessNodes = (node) => {
        let ret = {}
        if (!node) {
            return ret;
        }

        ret = handleTplIf(node);
        if (ret.nodeRemoved) {
            return ret;
        }

        ret = handleTplFor(node);
        if (ret.nodeRemoved) {
            return ret;
        }

        let childIdx = 0;
        while (childIdx < node.children.length) {
            const child = node.children[childIdx];
            
            const result = preProcessNodes(child);
            if (!result.nodeRemoved) {
                childIdx++;
            }
        }

        return ret;
    }

    const postProcessNodes = (node) => {
        let ret = {}
        if (!node) {
            return ret;
        }

        ret = handleTplModel(node);
        if (ret.nodeRemoved) {
            return ret;
        }

        let childIdx = 0;
        while (childIdx < node.children.length) {
            const child = node.children[childIdx];
            
            const result = postProcessNodes(child);
            if (!result.nodeRemoved) {
                childIdx++;
            }
        }

        return ret;
    }

    const nodeType = (node) => {
        if (node.nodeType === 3) {
            return 'text';
        }
        if (node.nodeType === 8) {
            return 'comment';
        }
        return node.nodeName;
    }

    const nodeContent = (node) => {
        if (node.childNodes?.length > 0) {
            return null;
        }
        return node.textContent;
    }

    const updateAttributes = (oldDOM, newDOM) => {
        if (oldDOM.nodeType !== 1 || newDOM.nodeType !== 1) {
            return;
        }

        let oldAttributes = oldDOM.attributes;
        const newAttributes = newDOM.attributes;

        if (oldAttributes.length === 0 && newAttributes.length === 0) {
            return;
        }

        // remove old attributes which dont exist in the new dom anymore
        for (let i = 0; i < oldAttributes.length; i++) {
            const oldAttrName = oldAttributes[i].name;
            if (newAttributes[oldAttrName] === undefined) {
                oldAttributes.removeNamedItem(oldAttrName);
            }
        }

        // add or update new attributes
        for (let i = 0; i < newAttributes.length; i++) {
            const newAttr = newAttributes[i];
            if (oldAttributes[newAttr.name] === undefined) {
                let createdAttr = document.createAttribute(newAttr.name);
                createdAttr.value = newAttr.value;
                oldAttributes.setNamedItem(createdAttr);
            } else if (oldAttributes[newAttr.name].value !== newAttr.value) {
                oldAttributes[newAttr.name].value = newAttr.value;
            }
        }
    }

    const diffAndUpdate = (oldDOM, newDOM) => {
        let oldDOMNodes = Array.prototype.slice.call(oldDOM.childNodes);
        let newDOMNodes = Array.prototype.slice.call(newDOM.childNodes);

        updateAttributes(oldDOM, newDOM);

        // remove excessive elements from old DOM
        let cnt = oldDOMNodes.length - newDOMNodes.length;
        while (cnt > 0) {
            let node = oldDOMNodes[oldDOMNodes.length - cnt];
            node.parentNode.removeChild(node);
            cnt--;
        }

        newDOMNodes.forEach((newNode, idx) => {
            // add new elements from new DOM
            if (idx >= oldDOMNodes.length) {
                oldDOM.appendChild(newNode.cloneNode(true));
                return;
            }

            // replace elements at idx, if node type completely differs
            if (nodeType(newNode) !== nodeType(oldDOMNodes[idx])) {
                oldDOMNodes[idx]
                    .parentNode
                    .replaceChild(newNode.cloneNode(true), oldDOMNodes[idx]);
                return;
            }

            // update text content, for leaf nodes
            const newNodeContent = nodeContent(newNode);
            const oldNodeContent = nodeContent(oldDOMNodes[idx]);
            if (newNodeContent && newNodeContent !== oldNodeContent) {
                oldDOMNodes[idx].textContent = newNodeContent;
            }
            
            updateAttributes(oldDOMNodes[idx], newNode);

            // old DOM has children, new DOM does not, clear children
            if (oldDOMNodes[idx].childNodes.length > 0 && newNode.childNodes.length < 1) {
                oldDOMNodes[idx].replaceChildren();
                return;
            }

            // old DOM has no chlidren, new DOM does, add them
            if (oldDOMNodes[idx].childNodes.length < 1 && newNode.childNodes.length > 0) {
                oldDOMNodes[idx].append(...newNode.childNodes);
            }

            if (newNode.childNodes.length > 0) {
                diffAndUpdate(oldDOMNodes[idx], newNode);
            }
        })
    }

    let vdom = createVDOM(evalDoubleCurlyBraces(ctx.template));
    removeInvisibility(vdom);
    preProcessNodes(vdom);
    
    if (ctx.fullRender) {
        ctx.rootNode.outerHTML = vdom.outerHTML;
        ctx.rootNode = document.querySelector(ctx.rootNodeSelector);
        ctx.fullRender = false;
    } else {
        diffAndUpdate(ctx.rootNode, vdom);
    }
    postProcessNodes(ctx.rootNode);
}

// === utilities ===

const createVDOM = (source) => {
    const node = document.createElement('template');
    node.innerHTML = source;
    return node.content.children[0];
}

const removeInvisibility = (node) => {
    node.classList.remove('invisible');
    if (node.classList.length == 0) {
        node.attributes.removeNamedItem('class')
    }
}