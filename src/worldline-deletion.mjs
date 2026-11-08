/**
 * A worldline's history exists from the common origin to 2026.
 * Deleting a selected line removes it and all descendants, never the
 * immutable reality baseline nor its unrelated sibling branches.
 *
 * Pure function: callers show confirmation before applying its result.
 */
export function planWorldlineDeletion(branches=[],selectedId=null,chats={}){
 if(!Array.isArray(branches)||typeof selectedId!=='string'||!selectedId)return null;
 const selected=branches.find(b=>b?.id===selectedId);
 if(!selected)return null;
 const removedIds=new Set([selectedId]);
 let changed=true;
 while(changed){
  changed=false;
  for(const branch of branches){
   if(!branch?.id||removedIds.has(branch.id))continue;
   if(branch.parentId&&removedIds.has(branch.parentId)){
    removedIds.add(branch.id);
    changed=true;
   }
  }
 }
 const survivors=branches.filter(branch=>!removedIds.has(branch?.id));
 const remainingChats={...((chats&&typeof chats==='object'&&!Array.isArray(chats))?chats:{})};
 for(const id of removedIds)delete remainingChats[id];
 return {selected,removedIds,removedCount:removedIds.size,
  descendantCount:removedIds.size-1,branches:survivors,chats:remainingChats};
}
