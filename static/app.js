'use strict';
const cents=v=>{if(!/^\d+(?:[.,]\d{1,2})?$/.test(v))throw Error();const[a,b='']=v.replace(',','.').split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const percent4=v=>{if(!/^\d+(?:[.,]\d{1,4})?$/.test(v))throw Error();const[a,b='']=v.replace(',','.').split('.');return BigInt(a)*10000n+BigInt(b.padEnd(4,'0'));};
const decimal=(n,scale=100n)=>`${n/scale}.${String(n%scale).padStart(String(scale).length-1,'0')}`;
const purchase=document.querySelector('#purchase-v2');
let purchaseSummary='';
const comboByName=new Map();
const initializedCombos=new WeakSet();let comboSequence=0;
const initCombo=root=>{
  if(!root||initializedCombos.has(root))return;initializedCombos.add(root);
  const input=root.querySelector('.combo-search');const select=root.querySelector('.combo-native');const list=root.querySelector('.combo-list');const toggle=root.querySelector('.combo-toggle');const allowNew=root.dataset.allowNew==='true';let matches=[];let active=-1;
  if(!list.id||document.getElementById(list.id)!==list)list.id=`combo-options-${++comboSequence}`;input.setAttribute('aria-controls',list.id);
  const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;};
  const activate=index=>{active=Math.max(0,Math.min(index,matches.length-1));list.querySelectorAll('[role=option]').forEach((item,i)=>item.classList.toggle('active',i===active));list.children[active]?.scrollIntoView({block:'nearest'});};
  const choose=option=>{select.value=option.value;input.value=option.textContent.trim();input.setCustomValidity('');close();select.dispatchEvent(new Event('change',{bubbles:true}));};
  const render=(showAll=false)=>{const query=showAll?'':input.value.trim().toLocaleLowerCase('es');matches=Array.from(select.options).filter(option=>option.value&&option.textContent.toLocaleLowerCase('es').includes(query));list.replaceChildren();for(const option of matches){const item=document.createElement('button');item.type='button';item.role='option';item.dataset.value=option.value;item.textContent=option.textContent;item.addEventListener('click',()=>choose(option));list.append(item);}if(!matches.length){const empty=document.createElement('p');empty.className='combo-empty';empty.textContent=allowNew?(input.value.trim()?'Puedes usar este nombre como tienda nueva.':'Escribe una tienda nueva.'):'Sin resultados';list.append(empty);}list.hidden=false;input.setAttribute('aria-expanded','true');if(matches.length)activate(0);};
  input.addEventListener('focus',render);input.addEventListener('click',render);input.addEventListener('input',()=>{select.value='';input.setCustomValidity(allowNew?'':'Selecciona una opción de la lista.');render();});
  input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();if(list.hidden)render();else activate(active+1);}else if(event.key==='ArrowUp'){event.preventDefault();activate(active-1);}else if(event.key==='Enter'&&!list.hidden&&matches[active]){event.preventDefault();event.stopPropagation();choose(matches[active]);}else if(event.key==='Escape')close();});
  toggle.addEventListener('click',()=>{if(list.hidden){input.focus();render(true);}else close();});document.addEventListener('click',event=>{if(!root.contains(event.target))close();});
  if(select.value){input.value=select.selectedOptions[0].textContent.trim();input.setCustomValidity('');}
  const controller={addAndSelect:(value,label)=>{select.add(new Option(label,value));choose(select.options[select.options.length-1]);}};if(select.name)comboByName.set(select.name,controller);
};
document.querySelectorAll('[data-combobox]').forEach(initCombo);
if(purchase){
 const clientDialog=document.querySelector('#client-dialog');
 document.querySelector('#open-client-dialog')?.addEventListener('click',()=>{document.querySelector('#quick-client-name').value='';document.querySelector('#quick-client-phone').value='';document.querySelector('#quick-client-address').value='';document.querySelector('#quick-client-status').textContent='';clientDialog.showModal();document.querySelector('#quick-client-name').focus();});
 document.querySelector('#close-client-dialog')?.addEventListener('click',()=>clientDialog.close());
 document.querySelector('#cancel-client-dialog')?.addEventListener('click',()=>clientDialog.close());
 const createClient=document.querySelector('#create-client-inline');
 createClient?.addEventListener('click',async()=>{const status=document.querySelector('#quick-client-status');const name=document.querySelector('#quick-client-name').value.trim();if(!name){status.textContent='Escribe el nombre del cliente.';document.querySelector('#quick-client-name').focus();return;}const data=new FormData();data.append('csrf',purchase.elements.csrf.value);data.append('name',name);data.append('phone',document.querySelector('#quick-client-phone').value);data.append('address',document.querySelector('#quick-client-address').value);createClient.disabled=true;status.textContent='Registrando cliente…';try{const response=await fetch('/compras/clientes',{method:'POST',body:data,headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo registrar el cliente.');comboByName.get('client_id').addAndSelect(result.id,result.name);clientDialog.close();update();}catch(error){status.textContent=error.message||'No se pudo registrar el cliente.';}finally{createClient.disabled=false;}});
 const accountDialog=document.querySelector('#account-dialog');const accountKind=document.querySelector('#quick-account-kind');const accountLast4=document.querySelector('#quick-account-last4');
 const updateAccountKind=()=>{const isCard=accountKind.value==='card';document.querySelector('#quick-account-last4-label').hidden=!isCard;accountLast4.disabled=!isCard;accountLast4.required=isCard;if(!isCard)accountLast4.value='';};
 document.querySelector('#open-account-dialog')?.addEventListener('click',()=>{document.querySelector('#quick-account-name').value='';accountKind.value='card';accountLast4.value='';document.querySelector('#quick-account-status').textContent='';updateAccountKind();accountDialog.showModal();document.querySelector('#quick-account-name').focus();});
 document.querySelector('#close-account-dialog')?.addEventListener('click',()=>accountDialog.close());
 document.querySelector('#cancel-account-dialog')?.addEventListener('click',()=>accountDialog.close());accountKind?.addEventListener('change',updateAccountKind);updateAccountKind();
 const createAccount=document.querySelector('#create-account-inline');
 createAccount?.addEventListener('click',async()=>{const status=document.querySelector('#quick-account-status');const name=document.querySelector('#quick-account-name').value.trim();const kind=accountKind.value;const last4=accountLast4.value.trim();if(!name){status.textContent='Escribe el nombre de la cuenta.';document.querySelector('#quick-account-name').focus();return;}if(kind==='card'&&!/^\d{1,4}$/.test(last4)){status.textContent='Escribe de 1 a 4 dígitos finales de la tarjeta.';accountLast4.focus();return;}const data=new FormData();data.append('csrf',purchase.elements.csrf.value);data.append('name',name);data.append('kind',kind);data.append('last4',last4);createAccount.disabled=true;status.textContent='Registrando cuenta…';try{const response=await fetch('/compras/cuentas',{method:'POST',body:data,headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo registrar la cuenta.');comboByName.get('payment_account_id').addAndSelect(result.id,result.name);accountDialog.close();update();}catch(error){status.textContent=error.message||'No se pudo registrar la cuenta.';}finally{createAccount.disabled=false;}});
 const lines=document.querySelector('#lines-v2');
 const commissionRate=purchase.elements.commission_rate;let commissionEdited=purchase.dataset.editing==='yes';
 commissionRate.addEventListener('input',()=>{commissionEdited=true;});
 const addLine=(focus=true)=>{if(lines.children.length>=100)return null;const line=lines.firstElementChild.cloneNode(true);line.querySelectorAll('input').forEach(i=>i.value=i.name==='quantity'?'1':'');line.querySelector('small')?.remove();const productCombo=line.querySelector('[data-product-combo]');productCombo.querySelector('.combo-native').value='';productCombo.querySelector('.combo-list').replaceChildren();productCombo.querySelector('.combo-list').hidden=true;lines.append(line);initCombo(productCombo);update();if(focus)line.querySelector('[name=product]').focus();return line;};
 function update(){
  Array.from(lines.children).forEach(line=>{line.querySelector('.remove-v2').disabled=lines.children.length===1;});
  try{let subtotal=0n;const details=[];for(const line of lines.children){const q=line.querySelector('[name=quantity]').value;const price=cents(line.querySelector('[name=price]').value);subtotal+=BigInt(q)*price;details.push(`${line.querySelector('[name=product]').value}: ${q} × ${decimal(price)}`);}
   const tax=(subtotal*percent4(purchase.elements.tax_rate.value)+500000n)/1000000n;const commissionBase=subtotal+tax;
   if(!commissionEdited){const suggested=commissionBase>BigInt(purchase.dataset.threshold)?BigInt(purchase.dataset.highRate):BigInt(purchase.dataset.lowRate);commissionRate.value=decimal(suggested);}
   const commission=(commissionBase*cents(commissionRate.value)+5000n)/10000n;const chargedTotal=commissionBase+commission;
   purchaseSummary=`Cliente: ${purchase.elements.client_id?.selectedOptions[0]?.textContent||purchase.dataset.client}\nJornada: ${purchase.elements.journey_id?.selectedOptions[0]?.textContent||purchase.dataset.journey}\nCuenta usada: ${purchase.elements.payment_account_id?.selectedOptions[0]?.textContent||'Sin seleccionar'}\nTienda: ${purchase.elements.store.value}\nMoneda: USD\n${details.join('\n')}\nSubtotal: ${decimal(subtotal)}\nTax (${purchase.elements.tax_rate.value}%): ${decimal(tax)}\nComisión (${commissionRate.value}%): ${decimal(commission)}\nTotal con comisión: ${decimal(chargedTotal)}\n\nSe guardará la compra y sus fotos etiquetadas.`;
   document.querySelector('#tax-preview').textContent=`USD · Productos ${decimal(subtotal)} + tax ${decimal(tax)} + comisión ${decimal(commission)} = ${decimal(chargedTotal)}`;
  }catch{purchaseSummary='Revisa productos, cantidades, precios, tax y comisión.';document.querySelector('#tax-preview').textContent='Completa los precios para calcular subtotal, tax, comisión y total.';}
 }
 document.querySelector('#add-line-v2').addEventListener('click',addLine);
 lines.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input,select')){e.preventDefault();addLine();}});
 lines.addEventListener('click',e=>{if(e.target.matches('.remove-v2')&&lines.children.length>1){e.target.closest('.line-card').remove();update();}});
 const photos=document.querySelector('#photos-v3');
 const updatePhotos=()=>Array.from(photos.children).forEach(row=>{row.querySelector('.remove-photo-v3').disabled=photos.children.length===1;});
 document.querySelector('#add-photo-v3').addEventListener('click',()=>{if(photos.children.length>=12)return;const row=photos.firstElementChild.cloneNode(true);row.querySelector('input').value='';row.querySelector('select').value='product';photos.append(row);row.querySelector('input').focus();updatePhotos();});
 photos.addEventListener('click',e=>{if(e.target.matches('.remove-photo-v3')&&photos.children.length>1){e.target.closest('.photo-upload-row').remove();updatePhotos();}});
 const analyze=document.querySelector('#analyze-photos');
 analyze?.addEventListener('click',async()=>{
  const status=document.querySelector('#ai-status');const data=new FormData();data.append('csrf',purchase.elements.csrf.value);
  for(const row of photos.children){const file=row.querySelector('[name=photo_file]').files[0];if(file){data.append('photo_file',file);data.append('photo_kind',row.querySelector('[name=photo_kind]').value);}}
  analyze.disabled=true;status.textContent='Gemini está analizando las fotos…';
  try{const response=await fetch('/compras/analizar-fotos',{method:'POST',body:data,headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo analizar.');
   while(lines.children.length>result.items.length)lines.lastElementChild.remove();while(lines.children.length<result.items.length)addLine(false);
   Array.from(lines.children).forEach((line,index)=>{const item=result.items[index];line.querySelector('[name=item_id]').value='';line.querySelector('[name=product]').value=item.name;line.querySelector('[name=quantity]').value=item.quantity;line.querySelector('[name=price]').value=item.unit_price;});
   purchase.elements.store.value=result.store;if(result.purchase_date)purchase.elements.date.value=result.purchase_date;if(result.tax_rate!==null)purchase.elements.tax_rate.value=result.tax_rate;update();
   status.textContent=`Gemini completó ${result.items.length} producto(s). ${result.warnings.length?`Revisa: ${result.warnings.join(' · ')}`:'Revisa todos los datos antes de guardar.'}`;
  }catch(error){status.textContent=error.message||'No se pudo analizar con Gemini.';}finally{analyze.disabled=false;}
 });
 purchase.addEventListener('input',update);update();updatePhotos();
}
const receipt=document.querySelector('#receipt-v2');
if(receipt){
 function updatePayment(){const e=receipt.elements;for(const option of e.billing_id.options){if(!option.value)continue;option.hidden=option.dataset.client!==e.client_id.value;option.disabled=option.hidden;if(option.hidden&&option.selected)e.billing_id.value='';}
  try{const amount=cents(e.amount.value);document.querySelector('#payment-preview').textContent=e.billing_id.value?`Se aplicarán USD ${decimal(amount)} al cobro seleccionado.`:`Anticipo disponible: USD ${decimal(amount)}.`;}catch{document.querySelector('#payment-preview').textContent='Completa el importe en USD.';}}
 receipt.addEventListener('input',updatePayment);receipt.addEventListener('change',updatePayment);updatePayment();
}
document.querySelectorAll('[data-account-form]').forEach(form=>{const kind=form.elements.kind;const last4=form.elements.last4;const label=last4.closest('label');const update=()=>{const card=kind.value==='card';label.hidden=!card;last4.disabled=!card;last4.required=card;if(!card)last4.value='';};kind.addEventListener('change',update);update();});
const dialog=document.querySelector('#confirm-dialog');let pendingForm=null;
document.querySelectorAll('form[data-confirm]').forEach(form=>form.addEventListener('submit',e=>{
 if(form.elements.confirmed.value==='yes')return;e.preventDefault();pendingForm=form;let message=purchaseSummary;
 if(form.dataset.confirm==='delivery')message=`Producto: ${form.dataset.product}\nCantidad: ${form.elements.quantity.value}\nNota: ${form.elements.note.value||'Sin nota'}\nFecha: ${form.elements.date.value}\n\nSe registrará esta entrega.`;
 if(form.dataset.confirm==='local')message=`${form.dataset.products}\nAcción: ${form.elements.action.selectedOptions[0].textContent}\nNota / motivo: ${form.elements.reason.value}`;
 document.querySelector('#confirm-summary').textContent=message;dialog.showModal();
}));
document.querySelector('#confirm-accept')?.addEventListener('click',()=>{const form=pendingForm;dialog.close();form.elements.confirmed.value='yes';form.requestSubmit();});
document.querySelector('#confirm-cancel')?.addEventListener('click',()=>dialog.close());
document.querySelector('#go-back')?.addEventListener('click',()=>history.back());
document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',e=>{if(e.defaultPrevented)return;form.querySelectorAll('button:not([type=button])').forEach(b=>b.disabled=true);}));
window.addEventListener('pageshow',()=>{document.querySelectorAll('form button:not([type=button])').forEach(b=>b.disabled=false);document.querySelectorAll('[name=confirmed]').forEach(i=>i.value='');});
