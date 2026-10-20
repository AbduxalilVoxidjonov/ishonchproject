
function toast(msg){
 const x=document.getElementById('toast'); if(!x)return;
 x.textContent=msg; x.style.display='block'; clearTimeout(window.__t);
 window.__t=setTimeout(()=>x.style.display='none',2200);
}
function toggleNav(){document.querySelector('.sidebar')?.classList.toggle('open')}
document.addEventListener('click',e=>{
 const a=e.target.closest('[data-toast]');
 if(a) toast(a.dataset.toast);
});
document.addEventListener('input',e=>{
 if(e.target.matches('[data-filter]')){
   const q=e.target.value.toLowerCase();
   const rows=document.querySelectorAll('[data-row]');
   rows.forEach(r=>r.style.display=r.innerText.toLowerCase().includes(q)?'':'none');
 }
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-select-filter]')){
   const q=e.target.value;
   const key=e.target.dataset.selectFilter;
   document.querySelectorAll('[data-row]').forEach(r=>{
      const v=r.dataset[key]||'';
      r.style.display=(!q || v===q)?'':'none';
   });
 }
});
