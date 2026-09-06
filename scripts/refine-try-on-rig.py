"""Run through Blender MCP after inspecting the generated garment scene.
Export task-owned copies; leave the original editable models untouched.
"""
import bpy, math
from pathlib import Path
OUT=Path('C:/dev/incorrect-society-shop')
original_scene=bpy.context.window.scene
scene=bpy.data.scenes.new('IS_TryOn_Rig_Refinement')
bpy.context.window.scene=scene
def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
result={}
for design in ['Secrets','Sinners']:
    source=[bpy.data.objects['IS3D_'+design+'_'+suffix] for suffix in ['Garment','Inside_Label','Ribbed_Neckband','Seam_Details','Rig']]
    clones={ob:ob.copy() for ob in source}
    for ob,clone in clones.items():
        clone.data=ob.data.copy();scene.collection.objects.link(clone)
        if ob.parent in clones:clone.parent=clones[ob.parent]
        for mod in clone.modifiers:
            if mod.type=='ARMATURE':mod.object=clones[source[-1]]
            if mod.type=='SUBSURF':mod.show_viewport=False;mod.show_render=False
        if clone.type!='MESH':continue
        for v in clone.data.vertices:
            x,y,z=v.co
            # Cuff underside used to inherit torso weights because of its low Z.
            # Past the armpit, the entire sleeve cross-section belongs to the arm.
            aw=smooth((abs(x)-.23)/.14)*max(smooth((z-.27)/.15),smooth((abs(x)-.30)/.06))
            chest=smooth((z-.26)/.24)
            weights={'chest':chest*(1-aw),'spine':(1-chest)*(1-aw),'upper_arm.L' if x>0 else 'upper_arm.R':aw}
            for group in clone.vertex_groups:group.remove([v.index])
            for name,weight in weights.items():
                if weight>0:clone.vertex_groups[name].add([v.index],weight,'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for clone in clones.values():clone.select_set(True)
    bpy.context.view_layer.objects.active=clones[source[0]]
    # Suppress fractional sheen export: see initial asset validation.
    states=[]
    for clone in clones.values():
        if clone.type=='MESH':
            for material in clone.data.materials:
                for node in material.node_tree.nodes:
                    if node.type=='BSDF_PRINCIPLED':
                        states.append((node,node.inputs['Sheen Weight'].default_value));node.inputs['Sheen Weight'].default_value=0
    path=OUT/'assets'/('vto-'+design.lower()+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_animations=False,export_skins=True,export_extras=True,export_yup=True)
    for node,value in reversed(states):node.inputs['Sheen Weight'].default_value=value
    result[design]={'bytes':path.stat().st_size,'cuff_min_arm_weight':min(sum(g.weight for g in v.groups if clones[source[0]].vertex_groups[g.group].name.startswith('upper_arm')) for v in clones[source[0]].data.vertices if abs(v.co.x)>.48)}
bpy.context.window.scene=original_scene
