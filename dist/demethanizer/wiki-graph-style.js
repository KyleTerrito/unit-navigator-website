// Shared component styles for saved Wiki screens and the Process Expert viewer.
function processKnowledgeGraphStyle(){
 const types={controller:['#dfac62','triangle'],material:['#59c7b1','ellipse'],equipment:['#578abd','roundrectangle'],energy:['#edc863','diamond'],indicator:['#ad88dc','ellipse']};
 const styles = [
  {selector:'node',style:{label:'data(name)',color:'#cddbea','font-size':12,'font-family':'Space Grotesk, sans-serif','text-valign':'bottom','text-margin-y':8,width:34,height:34}},
  ...Object.entries(types).map(([kind,[color,shape]])=>({selector:`node[kind="${kind}"]`,style:{'background-color':color,shape}})),
  {selector:'edge',style:{label:'','font-size':9,color:'#9fb4c8',width:2,'line-color':'#607b96','target-arrow-color':'#607b96','target-arrow-shape':'triangle','curve-style':'bezier','text-background-color':'#101b2b','text-background-opacity':.9,'text-background-padding':3}},
  {selector:':selected',style:{'border-width':3,'border-color':'#ffffff','line-color':'#ffffff','target-arrow-color':'#ffffff'}}
 ];
 const palettes = {
   white: {'#cddbea':'#172b36','#9fb4c8':'#526571','#101b2b':'#ffffff','#ffffff':'#147d67','#607b96':'#627d91'},
   'black-orbit': {'#cddbea':'#ededf0','#9fb4c8':'#aaaab3','#101b2b':'#101012','#ffffff':'#b7eed9','#607b96':'#757581'},
   bayou: {'#cddbea':'#e5f4ec','#9fb4c8':'#a1c0c7','#101b2b':'#0a202b','#ffffff':'#d1f79b','#607b96':'#54818f'}
 };
 const colors = palettes[document.documentElement.dataset.appearance];
 if(colors) {
   for(const rule of styles) for(const [key,value] of Object.entries(rule.style)) if(colors[value]) rule.style[key]=colors[value];
 }
 return styles;
}
// Update existing graphs in place so zoom, positions, and selection survive.
new MutationObserver(() => {
 for(const container of document.querySelectorAll('#wikiGraph,#wikiManualGraph,#expert-graph')) {
   const graph=container._cyreg?.cy;
   if(graph) graph.style().fromJson(processKnowledgeGraphStyle()).update();
 }
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-appearance']});
