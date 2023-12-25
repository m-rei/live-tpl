const initTemplate = (rootNodeSelector, data, invisibilityCSSClass = null) => {
    let ctx = {};

    ctx.rootNodeSelector = rootNodeSelector;
    ctx.rootNode = document.querySelector(rootNodeSelector);
    ctx.template = ctx.rootNode.outerHTML;
    ctx.data = data;
    ctx.localData = {};
    ctx.fullRender = true;
    ctx.invisibilityCSSClass = invisibilityCSSClass ;
    ctx.changeListeners = new Map();
    renderTemplate(ctx);

    return ctx;
}

const renderTemplate = (ctx) => {
    const TPL_FOR = 'tpl-for';
    const TPL_IF = 'tpl-if';
    const TPL_MODEL = 'tpl-model';

    const createVDOM = (source) => {
        const node = document.createElement('template');
        node.innerHTML = source;
        return node.content.children[0];
    }

    const tryToResolveVarRef = (varContainer, tokens) => {
        let ret = varContainer;
        let idx = 0;
        let name = '';
        while (idx < tokens.length) {
            let nextToken = tokens[idx];
            let arrIndices = [];
            if (nextToken.includes('[')) {
                const tokenParts = nextToken.split('[');
                nextToken = tokenParts[0];
                for (let i = 1; i < tokenParts.length; i++) {
                    indexTxt = tokenParts[i].substring(0, tokenParts[i].length - 1);
                    const indexResolved = parseInt(resolveVarRefs(indexTxt));
                    if (indexResolved != NaN) {
                        arrIndices.push(indexResolved);
                    }
                }
            }
            if (['string','number','boolean','array','object'].includes(typeof ret[nextToken])) {
                ret = ret[nextToken];
                name += `.${nextToken}`;
                for (let i = 0; i < arrIndices.length; i++) {
                    const ai = arrIndices[i];
                    ret = ret[ai];
                    name += `[${ai}]`;
                }
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
            name: name.substring(1),
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

        const re = /[a-zA-Z_$]([a-zA-Z$0-9_.-]*(\[[a-zA-Z$0-9_.-]*\])?(\.)?)*/g;
        const varRefs = [...txtStringsReplacedWithWhiteSpaces.matchAll(re)];
        for (let i = 0; i < varRefs.length; i++) {
            let varRef = varRefs[i];
            let varTokens = varRef[0].split('.');

            let val = tryToResolveVarRef(ctx.localData, varTokens);
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
                if ("i" === processedExpr) {
                    throw Exception();
                }
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
            if (matchedExpr.includes('[')) {
                let ret = tryToResolveVarRef(ctx.data, matchedExpr.split('.'));
                if (ret?.ret != undefined) {
                    matchedExpr = ret?.name;
                }
            }
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
            const processedExpr = '##' + btoa(resolveVarRefs(matchedExpr));
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
        return JSON.stringify(strValue);
    }

    const evalProxy = src => {
        return (function() {
            return eval(src);
        });
    }

    const tplModelChangeListener = (fullVarName) => {
        return (e) => {
            const newVal = e?.currentTarget?.value;
            if (newVal == undefined) {
                return;
            }
            
            let oldVal = evalProxy (`this.${fullVarName}`).bind(ctx.data)();
            if (oldVal == undefined) {
                return;
            }
            evalProxy (`this.${fullVarName}=${convert(newVal, oldVal)}`).bind(ctx.data)();
            renderTemplate(ctx);
        }
    }

    const handleTplModel = (node, referencedTplModels) => {
        const namedItem = node.attributes.getNamedItem(TPL_MODEL);
        if (!namedItem) {
            return {};
        }
        try {
            const fullVarName = namedItem.value;
            referencedTplModels.add(fullVarName);
            node.attributes.removeNamedItem(TPL_MODEL);
            let changeListener = ctx.changeListeners.get(fullVarName);
            if (!changeListener) {
                changeListener = tplModelChangeListener(fullVarName);
                ctx.changeListeners.set(fullVarName, changeListener);
            }
            node.removeEventListener('change', changeListener);
            node.addEventListener('change', changeListener);
            node.value = evalProxy (`this.${fullVarName}`).bind(ctx.data)();
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
            const val = resolveVarRefs(atob(namedItem.value.substring(2)));
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
                const localData = {};
                localData[forVar] = forVal;
                ctx.localData = localData;
                const processedTpl = evalTplDirectives(evalDoubleCurlyBraces(tpl), currentArrName, forVar, idx);
                ctx.localData = {};

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

    const postProcessNodes = (node, referencedTplModels) => {
        let ret = {}
        if (!node) {
            return ret;
        }

        ret = handleTplModel(node, referencedTplModels);
        if (ret.nodeRemoved) {
            return ret;
        }

        let childIdx = 0;
        while (childIdx < node.children.length) {
            const child = node.children[childIdx];
            
            const result = postProcessNodes(child, referencedTplModels);
            if (!result.nodeRemoved) {
                childIdx++;
            }
        }

        return ret;
    }

    const removeUnreferencedChangeListenersFromCtx = (referencedTplModels) => {
        const referencedTplModelsArr = Array.from(referencedTplModels);
        const changeListeners = Array.from(ctx.changeListeners.keys());
        for (const changeListener of changeListeners) {
            if (!referencedTplModelsArr.includes(changeListener)) {
                ctx.changeListeners.delete(changeListener);
            }
        }
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
    if (ctx.invisibilityCSSClass) {
        vdom.classList.remove(ctx.invisibilityCSSClass);
        if (vdom.classList.length == 0) {
            vdom.attributes.removeNamedItem('class');
        }
    }
    preProcessNodes(vdom);
    
    if (ctx.fullRender) {
        ctx.rootNode.outerHTML = vdom.outerHTML;
        ctx.rootNode = document.querySelector(ctx.rootNodeSelector);
        ctx.fullRender = false;
    } else {
        diffAndUpdate(ctx.rootNode, vdom);
    }
    let referencedTplModels = new Set();
    postProcessNodes(ctx.rootNode, referencedTplModels);
    removeUnreferencedChangeListenersFromCtx(referencedTplModels); 
}