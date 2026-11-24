/* One chart definition for FastMAN Analytics and embedded dashboard views. */
window.AnalyticsChartSpecs=(()=>{
  const palette=['#7cddc2','#8dbafb','#ecc078','#bd9cf5','#f48a99','#77d0ea','#d7c788','#b4dd85'];
  const color=label=>label<0?'#77838c':label<palette.length?palette[label]:'hsl('+((label*137.508)%360)+',65%,65%)';
  const layout=title=>({title:{text:title,font:{family:'Space Grotesk, sans-serif',size:15}},paper_bgcolor:'#111315',plot_bgcolor:'#111315',font:{color:'#bfc8cf',family:'Space Grotesk, sans-serif'},margin:{l:55,r:20,t:45,b:50},xaxis:{gridcolor:'#293136'},yaxis:{gridcolor:'#293136'},legend:{orientation:'h'}});
  function trend(result,name,key,selection=null,selectionRevision=0){
    const data=result.trends,axis=data.axis,order=result.labels.map((_,i)=>i).sort((a,b)=>axis.type==='date'?Date.parse(axis.values[a])-Date.parse(axis.values[b]):axis.values[a]-axis.values[b]);
    const spec=layout('');Object.assign(spec,{uirevision:key+':'+name,selectionrevision:selectionRevision,dragmode:'select',selectdirection:'h'});spec.xaxis={...spec.xaxis,title:axis.label,type:axis.type};spec.yaxis.title=name;
    return {traces:[{type:'scattergl',mode:'lines+markers',x:order.map(i=>axis.values[i]),y:order.map(i=>data.values[name][i]),customdata:order,text:order.map(i=>'Source row '+result.source_rows[i]),hovertemplate:'%{text}<br>%{x}<br>Value: %{y:.6g}<extra></extra>',line:{color:'#50616b',width:1},marker:{size:5,color:order.map(i=>color(result.labels[i]))},selectedpoints:selection===null?null:order.flatMap((id,i)=>selection.has(id)?[i]:[]),selected:{marker:{size:8,opacity:1}},unselected:{marker:{opacity:.15}}}],layout:spec};
  }
  function embedding(result,key,selection=null,selectionRevision=0){
    const three=result.settings.dimensions===3,traces=[];
    for(const label of [...new Set(result.labels)].sort((a,b)=>a-b)){
      const indices=result.labels.flatMap((value,i)=>value===label?[i]:[]);
      const trace={name:label===-1?'Noise':'Cluster '+label,type:three?'scatter3d':'scattergl',mode:'markers',x:indices.map(i=>result.embedding[i][0]),y:indices.map(i=>result.embedding[i][1]),customdata:indices,selectedpoints:selection===null?null:indices.flatMap((id,i)=>selection.has(id)?[i]:[]),selected:{marker:{opacity:1,size:9}},unselected:{marker:{opacity:.15}},text:indices.map(i=>'Source row '+result.source_rows[i]),hovertemplate:'%{text}<br>Dimension 1: %{x:.5g}<br>Dimension 2: %{y:.5g}<extra>%{fullData.name}</extra>',marker:{size:three?3:6,opacity:.8,color:color(label)}};
      if(three){trace.z=indices.map(i=>result.embedding[i][2]);trace.marker.color=indices.map(i=>selection===null||selection.has(i)?color(label):'#30383e');delete trace.selectedpoints;delete trace.selected;delete trace.unselected;}traces.push(trace);
    }
    const spec=layout('Reduced coordinates by cluster');spec.xaxis.title='Dimension 1';spec.yaxis.title='Dimension 2';Object.assign(spec,{scene:{xaxis:{title:'Dimension 1'},yaxis:{title:'Dimension 2'},zaxis:{title:'Dimension 3'}},uirevision:key,selectionrevision:selectionRevision,dragmode:three?'orbit':'select'});return{traces,layout:spec};
  }
  function clusters(result,key,selection=null){
    const rows=result.cluster_summary,x=rows.map(c=>c.cluster<0?'Noise':'Cluster '+c.cluster),counts=new Map();if(selection!==null)for(const i of selection)counts.set(result.labels[i],(counts.get(result.labels[i])||0)+1);
    return {traces:[{type:'bar',name:'Total',x,y:rows.map(c=>c.count),customdata:rows.map(c=>c.cluster),marker:{color:rows.map(c=>color(c.cluster)),opacity:selection===null?1:.4}},{type:'bar',name:'Selected',x,y:rows.map(c=>counts.get(c.cluster)||0),customdata:rows.map(c=>c.cluster),width:.4,marker:{color:'#ffffff'}}],layout:{...layout(''),barmode:'overlay',uirevision:key,yaxis:{title:'Observations',gridcolor:'#293136'}}};
  }
  function shap(result,key,limit=20,width=700){
    const explanation=result.shap;if(explanation?.status!=='complete')throw Error(explanation?.reason||'SHAP is unavailable for this analysis.');
    limit=limit||explanation.features.length;const rows=explanation.features.slice(0,limit),margin=Math.min(260,Math.max(105,Math.floor(width*.3))),maxLabel=Math.max(12,Math.floor(margin/7)-2);
    const traces=explanation.clusters.map((cluster,i)=>({type:'bar',orientation:'h',name:cluster<0?'Noise':'Cluster '+cluster,y:rows.map(r=>r.feature),x:rows.map(r=>r.contributions[i]),customdata:rows.map(r=>[r.feature,r.total?100*r.contributions[i]/r.total:0]),marker:{color:color(cluster)},hovertemplate:'%{customdata[0]}<br>Mean |SHAP|: %{x:.5f}<br>Share of feature total: %{customdata[1]:.1f}%<extra>%{fullData.name}</extra>'}));
    return{traces,layout:{...layout(''),height:Math.max(320,rows.length*29+140),barmode:'stack',margin:{l:margin,r:20,t:20,b:100},xaxis:{title:'Sum of mean |SHAP| (probability impact)',gridcolor:'#293136',rangemode:'tozero',automargin:true},yaxis:{autorange:'reversed',type:'category',categoryorder:'array',categoryarray:rows.map(r=>r.feature),tickmode:'array',tickvals:rows.map(r=>r.feature),ticktext:rows.map(r=>r.feature.length>maxLabel?r.feature.slice(0,maxLabel-1)+'…':r.feature)},legend:{orientation:'h',y:-.18,x:0},uirevision:key+':'+limit}};
  }
  function som(result,key,mode='distance',selection=null){
    const map=result.som;if(!map?.nodes?.length)throw Error('This source has no saved SOM map.');
    const nodes=map.nodes,feature=mode.startsWith('feature:')?Number(mode.split(':')[1]):null,categorical=mode==='cluster';
    const title=categorical?'Majority cluster per node':mode==='hits'?'Observations per node':feature!=null?map.features[feature]+' (preprocessed units)':`U-matrix (${map.rows} x ${map.cols})`;
    const classes=[...new Set(nodes.filter(n=>n.cluster!=null).map(n=>n.cluster))].sort((a,b)=>a-b),scale=['#30383e',...classes.map(color)],z=[],customdata=[];
    for(let r=0;r<map.rows;r++){const cells=nodes.slice(r*map.cols,(r+1)*map.cols);z.push(cells.map(n=>categorical?(n.cluster==null?0:classes.indexOf(n.cluster)+1):mode==='hits'?n.hits:feature!=null?n.display_components[feature]:n.display_distance));customdata.push(cells.map((n,c)=>[r*map.cols+c,n.hits,n.distance,n.cluster==null?'Empty':n.cluster<0?'Noise':'Cluster '+n.cluster]));}
    const selectedNodes=new Set(selection===null?[]:[...selection].map(i=>map.bmu[i])),occupied=nodes.flatMap((n,i)=>n.hits?[i]:[]);
    return{traces:[{type:'heatmap',z,customdata,zsmooth:false,xgap:0,ygap:0,colorscale:categorical?scale.flatMap((c,i)=>[[i/scale.length,c],[(i+1)/scale.length,c]]):'Jet',zmin:categorical?-.5:undefined,zmax:categorical?scale.length-.5:undefined,showscale:!categorical,colorbar:{thickness:14,len:.9},hovertemplate:'Node %{customdata[0]}<br>Column: %{x}<br>Row: %{y}<br>Observations: %{customdata[1]}<br>Raw neighbor distance: %{customdata[2]:.5g}<br>%{customdata[3]}<br>Display value: %{z:.5g}<extra></extra>'},{type:'scatter',mode:'markers',x:occupied.map(i=>nodes[i].x),y:occupied.map(i=>nodes[i].y),customdata:occupied.map(i=>[i]),hoverinfo:'skip',marker:{size:10,symbol:'square-open',color:occupied.map(i=>selectedNodes.has(i)?'#ffffff':'rgba(255,255,255,0)'),line:{width:2}},showlegend:false}],layout:{...layout(title),dragmode:'select',margin:{l:45,r:65,t:60,b:45},showlegend:false,xaxis:{title:'Column',range:[-.5,map.cols-.5],constrain:'domain',dtick:5},yaxis:{title:'Row',scaleanchor:'x',scaleratio:1,range:[map.rows-.5,-.5],constrain:'domain',dtick:5},uirevision:key}};
  }
  return{palette,color,layout,trend,embedding,clusters,shap,som};
})();
