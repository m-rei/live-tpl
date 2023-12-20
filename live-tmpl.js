const initTemplate = (rootNodeSelector, data) => {
    let ctx = {};

    ctx.rootNodeSelector = rootNodeSelector;
    ctx.rootNode = document.querySelector(rootNodeSelector);
    ctx.template = ctx.rootNode.outerHTML;
    ctx.data = data;
    ctx.localDataStack = [];
    ctx.fullRender = true;
    renderTemplate(ctx);

    return ctx;
}

const renderTemplate = (ctx) => {

    const substituteVarReferences = (txt) => {
        const findByVarObj = (obj, tokens) => {
            let ret = obj;
            for (let i = 0;
                i < tokens.length && ret;
                i++) {
                ret = ret[tokens[i]];
            }
            return ret;
        }

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

        const re = /(^|[ \[])([a-zA-Z_$][a-zA-Z0-9_.-]+)/g;
        const dataReferences = [...txtStringsReplacedWithWhiteSpaces.matchAll(re)];
        for (let i = 0; i < dataReferences.length; i++) {
            let dataReference = dataReferences[i];
            let dataTokens = dataReference[2].split('.');

            let val = null;
            for (let j = ctx.localDataStack.length-1; j >= 0 && !val; j--) {
                val = findByVarObj(ctx.localDataStack[j], dataTokens);
            }
            if (!val) {
                val = findByVarObj(ctx.data, dataTokens);
            }

            if (val) {
                txt = 
                    txt.substring(0, dataReference.index + dataReference[1].length) +
                    JSON.stringify(val)
                    txt.substring(dataReference.index + dataReference[1].length + dataReference[1].length)
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
            const processedExpr = substituteVarReferences(matchedExpr);
            txt = txt.slice(0, match.index + 2) + processedExpr + txt.slice(match.index + 2 + matchedExpr.length);
            try {
                let evaledExpr = eval('(' + processedExpr + ')');
                if (typeof evaledExpr == 'object') {
                    evaledExpr = JSON.stringify(evaledExpr).replaceAll('"', '\'');
                }
                txt = txt.slice(0, match.index) + evaledExpr + txt.slice(match.index + 4 + processedExpr.length);
            } catch (ignored) { }
        }
        return txt;
    }

    const evalTplForArr = (txt) => {
        const tplForRegEx = /tpl-for="([^;]*)/g; 
        const matches = [...txt.matchAll(tplForRegEx)];
        for (let i = matches.length-1; i >= 0; i--) {
            const match = matches[i];
            let matchedExpr = match[1];
            const processedExpr = substituteVarReferences(matchedExpr);
            txt = txt.slice(0, match.index + 9) + processedExpr + txt.slice(match.index + 9 + matchedExpr.length);
            try {
                let evaledExpr = eval('(' + processedExpr + ')');
                if (typeof evaledExpr == 'object') {
                    evaledExpr = JSON.stringify(evaledExpr).replaceAll('"', '\'');
                }
                txt = txt.slice(0, match.index + 9) + evaledExpr + txt.slice(match.index + 9 + processedExpr.length);
            } catch (ignored) { }
        }
        return txt;
    }

    const handleTplIf = (node) => {
        const tplIf = 'tpl-if';
        const namedItem = node.attributes.getNamedItem(tplIf);
        if (!namedItem) {
            return {};
        }
        try {
            const val = substituteVarReferences(namedItem.value);
            const evalResult = eval(val);
            node.attributes.removeNamedItem('tpl-if');
            if (evalResult == false) {
                node.parentNode.removeChild(node);
                return {
                    nodeRemoved: true,
                }
            }
        } catch (e) {
            console.warn(`[tpl-if] could not parse: ${namedItem.value}`);
        }
        return {};
    } 

    const handleTplFor = (node) => {
        const tplFor = 'tpl-for';
        const namedItem = node.attributes.getNamedItem(tplFor);
        if (!namedItem) {
            return {};
        }
        try {
            const forValues = namedItem.value.split(";");
            const forArrName = forValues[0].trim();
            const forArr = eval('(' + substituteVarReferences(forArrName).replaceAll(/([^\\])'/g, '$1"') + ')');
            const forVar = forValues[1].trim();
            node.attributes.removeNamedItem(tplFor);
            const tpl = node.outerHTML;
            
            for (let forVal of forArr) {
                let stack = {};
                stack[forVar] = forVal;
                ctx.localDataStack.push(stack);
                const processedTpl = evalTplForArr(evalDoubleCurlyBraces(tpl));
                ctx.localDataStack.pop();

                const newNode = createVDOM(processedTpl);
                node.parentElement.insertBefore(newNode, node);
            }

            node.parentNode.removeChild(node);
            return {
                nodeRemoved: true,
            }
        } catch (e) {
            console.warn(`[tpl-for] could not parse: ${namedItem.value}`);
        }
        return {};
    }

    const processNodes = (node) => {
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
            
            const result = processNodes(child);
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
    processNodes(vdom);
    
    if (ctx.fullRender) {
        ctx.rootNode.outerHTML = vdom.outerHTML;
        ctx.rootNode = document.querySelector(ctx.rootNodeSelector);
        ctx.fullRender = false;
    } else {
        diffAndUpdate(ctx.rootNode, vdom);
    }
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