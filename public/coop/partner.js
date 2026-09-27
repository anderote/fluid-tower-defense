const key=location.hash.slice(1).replace(/[\s-]/g,'').toLowerCase(),view=document.querySelector('#view'),connection=document.querySelector('#connection'),error=document.querySelector('#error'),controls=[...document.querySelectorAll('#controls button,#controls select')];
let frame=null,lastSeen=0,loading=false;
function online(value){for(const control of controls)control.disabled=!value;connection.textContent=value?'Connected · shared defense':'Host unavailable — ask your partner to keep the game visible and sharing.';}
online(false);
const join=document.querySelector('#join'),code=document.querySelector('#code');
code.value=key;
join.onsubmit=event=>{event.preventDefault();const value=code.value.replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{10}$/.test(value)){connection.textContent='Enter the 10-character code shown by the host.';return;}location.hash=value;location.reload();};
if(!/^[a-f0-9]{10}$/.test(key)){connection.textContent='Enter the room code shown by your partner.';}else{
 const events=new EventSource('/coop/events?key='+key);
 events.addEventListener('frame',event=>{if(loading)return;const next=JSON.parse(event.data);loading=true;const image=new Image();image.onload=()=>{view.src=next.image;frame=next;lastSeen=Date.now();document.querySelector('#status').textContent=next.status;loading=false;online(true);join.hidden=true;};image.onerror=()=>{loading=false;};image.src=next.image;});
 events.addEventListener('offline',()=>online(false));events.onerror=()=>online(false);
 setInterval(()=>{if(Date.now()-lastSeen>3000)online(false);},1000);
 async function command(value){if(Date.now()-lastSeen>3000)return;try{const response=await fetch('/coop/command?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});error.textContent=response.ok?'Command sent — see host status above.':await response.text();}catch{error.textContent='Connection lost. Waiting to reconnect…';online(false);}}
 for(const button of document.querySelectorAll('[data-command]'))button.onclick=()=>command({type:button.dataset.command});
 view.onclick=event=>{const kind=document.querySelector('#tower').value;if(!kind||!frame)return;const bounds=view.getBoundingClientRect(),scale=Math.min(bounds.width/view.naturalWidth,bounds.height/view.naturalHeight),width=view.naturalWidth*scale,height=view.naturalHeight*scale,x=(event.clientX-bounds.left-(bounds.width-width)/2)/width,y=(event.clientY-bounds.top-(bounds.height-height)/2)/height;if(x>=0&&x<=1&&y>=0&&y<=1)void command({type:'place',kind,x,y,frame:frame.id});};
}
