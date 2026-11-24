/* Deterministic, read-only calculation graph. No expressions or executable code. */
(function (root) {
  'use strict';
  const types = ['calc_input', 'calc_constant', 'calc_sum', 'calc_product', 'calc_divide', 'calc_gain', 'calc_abs', 'calc_result', 'calc_indicator'];
  const isBlock = node => !!node && types.includes(node.type);
  function inputCount(node) {
    if (!isBlock(node) || ['calc_input', 'calc_constant'].includes(node.type)) return 0;
    if (node.type === 'calc_sum') return (node.calculation?.signs || '++').length;
    if (node.type === 'calc_indicator') return (node.calculation?.inputs || [{kind:'wire'},{kind:'wire'}]).length;
    return ['calc_product', 'calc_divide'].includes(node.type) ? 2 : 1;
  }
  const ports = node => node.type === 'calc_indicator' ? ['control','out'] : [...Array.from({length: inputCount(node)}, (_, i) => 'in' + (i + 1)), 'out'];
  function evaluate(document, resolve, definitions = {groups: {}, aliases: {}}) {
    const nodes = new Map(document.nodes.map(node => [node.id, node])), results = new Map(), visiting = new Set();
    const incoming = new Map();
    for (const edge of document.edges) {
      if (edge.kind !== 'signal' || edge.visual_only || nodes.get(edge.source)?.type === 'signal' || !isBlock(nodes.get(edge.target)) || nodes.get(edge.target).type === 'calc_indicator') continue;
      const key = edge.target + ':' + edge.target_port;
      if (!incoming.has(key)) incoming.set(key, []);
      incoming.get(key).push(edge.source);
    }
    const canonical = unit => definitions.aliases[unit] || unit || '';
    const group = unit => Object.values(definitions.groups).find(units => Object.hasOwn(units, canonical(unit)));
    const dimensionless = unit => !unit || Object.hasOwn(definitions.groups.Fraction || {}, canonical(unit));
    function convert(value, from, to) {
      from = canonical(from); to = canonical(to);
      if (from === to) return value;
      if (!from && dimensionless(to)) from = 'fraction';
      if (!to && dimensionless(from)) to = 'fraction';
      const units = group(from);
      if (!units || !Object.hasOwn(units, to)) throw Error('Incompatible units: ' + (from || 'unitless') + ' and ' + (to || 'unitless'));
      return (value * units[from][0] + units[from][1] - units[to][1]) / units[to][0];
    }
    function arithmetic(a, b, op) {
      if (op === '+' || op === '-') {
        const unit = a.unit || b.unit;
        const av = !a.unit && a.value === 0 ? 0 : convert(a.value, a.unit, unit);
        const bv = !b.unit && b.value === 0 ? 0 : convert(b.value, b.unit, unit);
        return {value: op === '+' ? av + bv : av - bv, unit};
      }
      const av = dimensionless(a.unit) ? convert(a.value, a.unit, '') : a.value;
      const bv = dimensionless(b.unit) ? convert(b.value, b.unit, '') : b.value;
      if (op === '*') return {value:av * bv, unit:dimensionless(a.unit) ? (dimensionless(b.unit) ? '' : b.unit) : dimensionless(b.unit) ? a.unit : a.unit + '·' + b.unit};
      if (bv === 0) throw Error('Division by zero');
      if (dimensionless(b.unit)) return {value:av / bv, unit:dimensionless(a.unit) ? '' : a.unit};
      if (a.unit === b.unit || group(a.unit) && group(a.unit) === group(b.unit)) return {value:a.value / convert(b.value,b.unit,a.unit),unit:''};
      return {value:av / bv,unit:'(' + (a.unit || '1') + ')/(' + b.unit + ')'};
    }
    function formula(expression, inputs) {
      if (!expression || expression.length > 200) throw Error('Enter a formula up to 200 characters');
      const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-H]|[()+*/-]|\S/g) || [];
      let at = 0;
      function atom() {
        const token = tokens[at++];
        if (token === '+' || token === '-') {const a = atom(); return {...a,value:token === '-' ? -a.value : a.value};}
        if (token === '(') {const a = sum(); if (tokens[at++] !== ')') throw Error('Missing closing parenthesis'); return a;}
        if (/^[A-H]$/.test(token || '')) {const a = inputs[token.charCodeAt(0) - 65]; if (!a) throw Error('Unavailable input ' + token); return a;}
        if (token && /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) return {value:Number(token),unit:''};
        throw Error('Use inputs A–H, numbers, parentheses, and + - * /');
      }
      function product() {let a = atom(); while (['*','/'].includes(tokens[at])) {const op = tokens[at++]; a = arithmetic(a,atom(),op);} return a;}
      function sum() {let a = product(); while (['+','-'].includes(tokens[at])) {const op = tokens[at++]; a = arithmetic(a,product(),op);} return a;}
      const result = sum(); if (at !== tokens.length) throw Error('Invalid formula'); return result;
    }
    function visit(id) {
      if (results.has(id)) return results.get(id);
      if (visiting.has(id)) return {value: null, unit: '', state: 'Error', error: 'Circular calculation connection'};
      const node = nodes.get(id);
      if (!node) return {value: null, unit: '', state: 'Error', error: 'Missing source block'};
      visiting.add(id);
      let result;
      try {
        const config = node.calculation || {};
        if (!isBlock(node) || node.type === 'calc_input') {
          result = resolve(node);
          if (!result || !Number.isFinite(result.value)) throw Error(result?.error || result?.state || 'Source unavailable');
          result = {...result, unit: canonical(result.unit)};
        } else if (node.type === 'calc_constant') {
          result = {value: config.value ?? 0, unit: canonical(config.unit), state: 'Ready'};
        } else {
          const inputs = [];
          for (let i = 1; i <= inputCount(node); i++) {
            const sources = incoming.get(id + ':in' + i) || [];
            const spec = node.type === 'calc_indicator' ? config.inputs?.[i - 1] || {kind:'wire'} : {kind:'wire'};
            let input;
            if (spec.kind !== 'wire' && sources.length) throw Error('Input ' + i + ' has both a wire and a selected source');
            if (spec.kind === 'constant') input = {value:spec.value ?? 0,unit:canonical(spec.unit),state:'Ready'};
            else if (spec.kind === 'hysys' || spec.kind === 'screen' && spec.source) input = resolve({type:'calc_input',calculation:{source:spec.source}});
            else if (spec.kind === 'screen') input = visit(spec.node_id);
            else {
              if (sources.length !== 1) throw Error(sources.length ? 'Multiple connections to input ' + i : 'Missing input ' + i);
              input = visit(sources[0]);
            }
            if (!input || !Number.isFinite(input.value)) throw Error('Input ' + 'ABCDEFGH'[i - 1] + ': ' + (input?.error || input?.state || 'Source unavailable'));
            inputs.push({...input,unit:canonical(input.unit)});
          }
          const a = inputs[0], b = inputs[1];
          let value = a.value, unit = a.unit;
          if (node.type === 'calc_indicator') {
            const calculated = formula(config.formula || 'A / B', inputs);
            unit = calculated.unit; value = calculated.value;
            if (config.display_unit) {value = convert(value,unit,config.display_unit); unit = config.display_unit;}
          } else if (node.type === 'calc_sum') {
            unit = inputs.find(input => input.unit)?.unit || '';
            value = inputs.reduce((total, input, i) => total + ((config.signs || '++')[i] === '+' ? 1 : -1) *
              (!input.unit && input.value === 0 ? 0 : convert(input.value, input.unit, unit)), 0);
          } else if (node.type === 'calc_product') {
            const av = dimensionless(a.unit) ? convert(a.value, a.unit, '') : a.value;
            const bv = dimensionless(b.unit) ? convert(b.value, b.unit, '') : b.value;
            value = av * bv;
            unit = dimensionless(a.unit) ? (dimensionless(b.unit) ? '' : b.unit) : dimensionless(b.unit) ? a.unit : a.unit + '·' + b.unit;
          } else if (node.type === 'calc_divide') {
            if (b.value === 0) throw Error('Division by zero');
            if (dimensionless(b.unit)) {
              value = (dimensionless(a.unit) ? convert(a.value, a.unit, '') : a.value) / convert(b.value, b.unit, '');
              unit = dimensionless(a.unit) ? '' : a.unit;
            } else if ((group(a.unit) && group(a.unit) === group(b.unit)) || a.unit === b.unit) {
              value = a.value / convert(b.value, b.unit, a.unit); unit = '';
            } else {value = a.value / b.value; unit = '(' + (a.unit || '1') + ')/(' + b.unit + ')';}
          } else if (node.type === 'calc_gain') value *= config.gain ?? 1;
          else if (node.type === 'calc_abs') value = Math.abs(value);
          result = {value, unit, state: inputs.some(input => input.state === 'Live') ? 'Live' : 'Ready'};
        }
        if (!Number.isFinite(result.value)) throw Error('Non-finite calculation result');
      } catch (error) {result = {value: null, unit: '', state: 'Error', error: error.message};}
      visiting.delete(id); results.set(id, result); return result;
    }
    document.nodes.filter(isBlock).forEach(node => visit(node.id));
    return results;
  }
  const api = {types, isBlock, inputCount, ports, evaluate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DcsCalculations = api;
})(typeof window !== 'undefined' ? window : globalThis);
