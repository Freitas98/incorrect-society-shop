"""Run through Blender MCP. Task-owned copies, original scene/files preserved.
Generate a welded simulation cage in GLB extras and a low-cost mobile LOD.
The source is the previously authored, reweighted garment .blend, not a scan.
"""
import bpy, json, math
from pathlib import Path
ROOT=Path('C:/dev/incorrect-society-shop')
source_scene=bpy.data.scenes['IS_TryOn_Rig_Refinement']
original_scene=bpy.context.window.scene
scene=bpy.data.scenes.new('IS_Fitting_Room_Cloth_V2')
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
bpy.context.window.scene=scene
def cage_for(ob):
    # Weld nearby surface vertices. Preserve front/back at the side seams through
    # actual mesh connectivity rather than linking across empty arm/neck openings.
    cells={};groups=[];mapping=[]
    for v in ob.data.vertices:
        key=tuple(round(c/.04) for c in v.co)
        if key not in cells: cells[key]=len(groups);groups.append([])
        idx=cells[key];groups[idx].append(v);mapping.append(idx)
    nodes=[]
    for group in groups:
        p=[sum(v.co[k] for v in group)/len(group) for k in range(3)]
        weights={}
        for v in group:
            for g in v.groups:
                name=ob.vertex_groups[g.group].name
                weights[name]=weights.get(name,0)+g.weight/len(group)
        nodes.append({'p':[round(p[0],6),round(p[2],6),round(-p[1],6)],
                      'w':{k:round(v,6) for k,v in weights.items() if v>.00001}})
    edges=set()
    for polygon in ob.data.polygons:
        ids=list(polygon.vertices)
        for a in range(len(ids)):
            for b in range(a+1,len(ids)):
                x,y=sorted((mapping[ids[a]],mapping[ids[b]]))
                if x!=y:edges.add((x,y))
    return {'version':1,'cell':.04,'nodes':nodes,'edges':sorted(edges)}
result={}
try:
    for design in ['Secrets','Sinners']:
        source=[o for o in source_scene.objects if o.name.startswith('IS3D_'+design+'_')]
        clones={o:o.copy() for o in source}
        for ob,clone in clones.items():
            clone.data=ob.data.copy();scene.collection.objects.link(clone)
        for ob,clone in clones.items():
            if ob.parent in clones:clone.parent=clones[ob.parent]
            for mod in clone.modifiers:
                if mod.type=='ARMATURE':mod.object=clones[mod.object]
                if mod.type=='SUBSURF':mod.show_viewport=False;mod.show_render=False
        garment=next(o for o in clones.values() if '_Garment' in o.name)
        cage=cage_for(garment)
        rig=next(o for o in clones.values() if o.type=='ARMATURE')
        rig['vto_cloth_cage']=json.dumps(cage,separators=(',',':'))
        garment['fit_status']='Dimension-driven visual garment with bounded runtime cloth cage; not a measured physical fabric model'
        for clone in clones.values():
            if clone.type=='MESH':
                # Private material copies; preserve the source scenes.
                for i,mat in enumerate(clone.data.materials):
                    clone.data.materials[i]=mat.copy()
                    for node in clone.data.materials[i].node_tree.nodes:
                        if node.type=='BSDF_PRINCIPLED':node.inputs['Sheen Weight'].default_value=0
        for lite in [False,True]:
            bpy.ops.object.select_all(action='DESELECT')
            selected=[]
            for clone in clones.values():
                if lite and '_Seam_Details' in clone.name:continue
                if clone.type=='MESH' and lite:
                    for mod in clone.modifiers:
                        if mod.type=='SOLIDIFY':mod.show_viewport=False;mod.show_render=False
                    if clone is garment:
                        dec=clone.modifiers.new('Mobile surface LOD','DECIMATE');dec.ratio=.5
                clone.select_set(True);selected.append(clone)
            bpy.context.view_layer.objects.active=garment
            bpy.context.view_layer.update()
            filename='vto-'+design.lower()+('-lite' if lite else '')+'.glb'
            path=ROOT/'assets'/filename
            bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
                use_active_scene=True,export_apply=True,export_animations=False,export_skins=True,
                export_extras=True,export_yup=True)
            result[filename]={'bytes':path.stat().st_size,'cage_nodes':len(cage['nodes']),'constraints':len(cage['edges'])}
        # Keep the editable source copy at full detail in the saved library.
        for clone in clones.values():
            for mod in clone.modifiers:
                if mod.type=='SOLIDIFY':mod.show_viewport=True;mod.show_render=True
                if mod.type=='DECIMATE':mod.show_viewport=False;mod.show_render=False
    bpy.data.libraries.write(str(ROOT/'artifacts/try-on/cloth-models-v2.blend'),{scene},fake_user=True,compress=True)
finally:
    bpy.context.window.scene=original_scene
