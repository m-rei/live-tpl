let data = {
    'bool': false,
    'str': 'Hello There',
    'textStr': 'text',
    'obj': {
        name: 'test',
        arr: [1, 2, 3],
        nestedArr: [
            [2, 4, 6],
            [3, 6, 9],
        ]
    },
	arr1: [
		{arr2: [1, 2]},
		{arr2: [10, 20]},
	],
	arr3: [0],
}

const tplCtx = initTemplate('#app', data, 'invis');

function toggleBool() {
    data.bool = !data.bool;
    renderTemplate(tplCtx);
}

function randomStr() {
    return (Math.random() + 1).toString(36).substring(7);
}

function addClick() {
    const idx = Math.floor(Math.random() * data.obj.arr.length);
    data.obj.arr.splice(idx, 0, `${idx}-${randomStr()}`);
    renderTemplate(tplCtx);
}

function modClick() {
    const idx = Math.floor(Math.random() * data.obj.arr.length);
    data.obj.arr[idx] = `${idx}-${randomStr()}`;
    renderTemplate(tplCtx);
}

function delClick() {
    const idx = Math.floor(Math.random() * data.obj.arr.length);
    data.obj.arr.splice(idx, 1);
    renderTemplate(tplCtx);
}