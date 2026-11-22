import {Learning,seededRandom,shuffle,sameSelection,cleanRows,passingRows,payload,csv,validateContent} from './core.mjs?v=ng4_web_v22_local';

const $=selector=>document.querySelector(selector);
const content=$('#content'),footer=$('#footer'),notes=$('#notes'),root=$('#experiment');
const params=new URLSearchParams(location.search);
const LOCAL=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const credentials=['experiment_id','participant_id'].map(k=>params.get(k));
const ROUTED=credentials.every(v=>v&&v!=='NONE');
const PREVIEW=!ROUTED&&(LOCAL||params.get('preview')==='1');
let spec,meta,learning,rows=[],answers={},activeKeys=null,started=false,finished=false,uploading=false,submitted=false;
let timing=null,pageEpoch=0;
const held=new Set();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rich(s){return esc(s).replace(/\b(Pog|Gom|Jop|Zok|Lod|Powers?|powers?)\b/gi,'<strong class="power">$1</strong>')
  .replace(/\b(Fim|Miv|Digits?|digits?)\b/gi,'<strong class="digit">$1</strong>').replace(/\bRight Key\b/g,'<strong>Right Key</strong>').replace(/(C for No|\/ for Yes)/g,'<strong>$1</strong>');}
const prose=(s,styled=true)=>String(s).split(/\n\s*\n/).map(p=>'<p>'+(styled?rich(p):esc(p)).replaceAll('\n','<br>')+'</p>').join('');
const keyLegend=(magnitude=false)=>'<div class="response-keys"><span><kbd>C</kbd> '+'No'+'</span><span><kbd>/</kbd> '+'Yes'+'</span></div>';
const magnitudeInstructionKeys=()=>'<span class="response-keys instruction-key-icons"><span><kbd>C</kbd> No</span><span><kbd>/</kbd> Yes</span></span>';
const feedbackSlot=()=>'<div class="feedback-slot" aria-live="polite"></div>';
const nextLabel='(Right Key for Continue)',backLabel='(Left Key for Back)';

document.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if(event.repeat||held.has(key))return;
  held.add(key);
  if(activeKeys&&activeKeys(event,key))event.preventDefault();
});
document.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{held.clear();if(timing)timing.focus_losses++;});
document.addEventListener('visibilitychange',()=>{
  held.clear();if(timing&&document.hidden){timing.hidden_during_trial=true;timing.rt_valid=false;}
});
window.addEventListener('beforeunload',event=>{
  if(started&&!submitted){event.preventDefault();event.returnValue='';}
});

function draw(html,{note='',keys='',footerHTML=''}={}){
  pageEpoch++;activeKeys=null;root.classList.remove('correct','response-trial','comprehension-trial');
  content.innerHTML=html;notes.hidden=!note;$('#notes-content').innerHTML=rich(note);
  footer.innerHTML=keys+footerHTML;root.dataset.stage='page';
}
function navigate({back=false,label=nextLabel}={}){
  return '<div class="navigation">'+(back?'<button class="back" type="button">'+backLabel+'</button>':'')+
    '<button class="next" type="button">'+label+'</button></div>';
}
function page(html,{note='',back=false,keys=''}={}){
  draw(html,{note,keys,footerHTML:navigate({back})});
  return new Promise(resolve=>{
    const done=value=>{activeKeys=null;resolve(value);};
    $('.next').onclick=()=>done('right');
    if(back)$('.back').onclick=()=>done('left');
    activeKeys=(_,key)=>{if(key==='arrowright'||(back&&key==='arrowleft')){done(key==='arrowright'?'right':'left');return true;}return false;};
  });
}
async function pages(items){
  let index=0;
  while(index<items.length){const item=items[index];
    const body=item.body.replace('Press / for Yes or C for No.','').trim();
    let instructionHTML=prose(body,item.semantic_colors!==false).replace(rich('Press C for No or / for Yes.'),rich('Press C for No or / for Yes.')+magnitudeInstructionKeys());
    for(const sentence of item.emphasize??[])instructionHTML=instructionHTML.replace(rich(sentence),'<strong>'+rich(sentence)+'</strong>');
    if(item.celebration)instructionHTML='<div class="celebration"><span class="celebration-icon" aria-hidden="true">👍</span><p>Good job!</p></div>';
    const direction=await page(instructionHTML,{note:item.notes??'',back:index>0,
      keys:item.body.includes('Press / for Yes or C for No.')?keyLegend():''});
    index=direction==='left'?Math.max(0,index-1):index+1;
  }
}
async function comprehension(){
  let number=0;
  for(let i=0;i<spec.comprehension.length;i++){
    const q=spec.comprehension[i];let correct=false;
    while(!correct){
      const multiple=q.correct.length>1;
      draw(prose(q.prompt,false)+'<div class="choices">'+q.options.map((option,j)=>
        '<label class="choice"><span class="option-number">'+(j+1)+'</span><input type="'+(multiple?'checkbox':'radio')+
        '" name="answer" value="'+j+'">'+esc(option)+'</label>').join('')+'</div>'+feedbackSlot(),
        {footerHTML:'<p class="hint">Number keys to select'+(multiple?' all that apply':'')+'; Right Key to submit.</p>'+navigate()});
      root.classList.add('comprehension-trial');root.dataset.stage='comprehension';const onset=performance.now();
      const selection=await new Promise(resolve=>{
        const finish=()=>{const selected=new Set([...document.querySelectorAll('input:checked')].map(el=>Number(el.value)));
          if(!selected.size)return;activeKeys=null;resolve(selected);};
        $('.next').onclick=finish;
        const update=()=>document.querySelectorAll('.choice').forEach(label=>label.classList.toggle('selected',label.querySelector('input').checked));
        document.querySelectorAll('input').forEach(el=>el.onchange=update);
        activeKeys=(_,key)=>{if(key==='arrowright'){finish();return true;}
          const index=Number(key)-1;if(/^[1-7]$/.test(key)&&index<q.options.length){
            const el=document.querySelector('input[value="'+index+'"]');
            if(!multiple)document.querySelectorAll('input').forEach(other=>other.checked=false);
            el.checked=multiple?!el.checked:true;update();return true;}return false;};
      });
      correct=sameSelection(selection,q.correct);
      record({phase:'comprehension',trial_id:'Q'+(i+1),presentation_order:++number,stimulus:q.prompt,
        condition:'instruction_check',correct_key:q.correct.map(j=>q.options[j]).join('; '),
        response:[...selection].sort((a,b)=>a-b).map(j=>q.options[j]).join('; '),correct:Number(correct),
        rt_seconds:(performance.now()-onset)/1000});
      await trialFeedback(correct,'comprehension',!correct&&i>=2?spec.comprehension_category_notes:'');
    }
  }
}
function persist(){
  try{sessionStorage.setItem('ng4-active-session',JSON.stringify({meta,rows,answers,
    learning:learning?{block:learning.block,attempts:learning.attempts,failed:learning.failed,errors:learning.errors,requiredCorrect:learning.requiredCorrect,minAccuracy:learning.minAccuracy,passed:learning.passed}:null}));}
  catch(error){console.warn('Session backup unavailable:',error.name);}
}
function record(row){rows.push(row);persist();}
async function wait(ms,fixation=false){draw(fixation?'<div class="fixation">+</div>':'');root.dataset.stage='fixation';await sleep(ms);}
function timedQuestion(trial){
  const judgment=trial.phase==='judgment'||trial.phase==='english_judgment';
  draw(judgment?prose(trial.phase==='english_judgment'?spec.english_prompt:spec.judgment_prompt)+'<div class="stimulus">'+rich(trial.stimulus)+'</div>':
    '<div class="comparison">'+rich(trial.stimulus)+'</div>',{keys:keyLegend(!judgment)});
  content.insertAdjacentHTML('beforeend',feedbackSlot());root.classList.add('response-trial');
  root.dataset.stage=judgment?trial.phase:'learning';
  return new Promise(resolve=>{
    timing={onset_ms:null,focus_losses:0,hidden_during_trial:document.hidden,rt_valid:!document.hidden};
    // The rAF immediately preceding the stimulus paint defines browser stimulus onset.
    // Response handling only starts here, after the preceding fixation/blank has ended.
    requestAnimationFrame(()=>{
      timing.onset_ms=performance.now();
      activeKeys=(event,key)=>{
        const positive='/';
        if(key!==positive&&key!=='c')return false;
        const now=performance.now();const eventTime=event.timeStamp;
        const responseTime=eventTime>=timing.onset_ms&&eventTime<=now+2?eventTime:now;
        const result={response:key,rt_seconds:(responseTime-timing.onset_ms)/1000,...timing};
        result.rt_valid=result.rt_valid&&result.focus_losses===0;
        timing=null;activeKeys=null;root.dataset.stage='responded';resolve(result);return true;
      };
    });
  });
}
async function trialFeedback(correct,phase,notesText=''){
  activeKeys=null;
  const slot=$('.feedback-slot');
  document.querySelectorAll('#content input,#footer button').forEach(el=>el.disabled=true);
  slot.innerHTML='<div class="feedback-box '+(correct?'feedback-correct':'feedback-incorrect')+'"><p class="feedback-label">'+(correct?'Correct':'Incorrect')+'</p>'+
    (notesText?'<div class="feedback-notes">'+rich(notesText).replaceAll('\n','<br>')+'</div>':'')+'<span class="feedback-countdown"></span></div>';
  const seconds=correct?spec.config.correct_feedback_seconds:spec.config.incorrect_feedback_seconds;
  root.dataset.stage='feedback';root.dataset.feedback=correct?'correct':'incorrect';root.dataset.feedbackPhase=phase;
  root.dataset.feedbackStartedAt=String(performance.now());
  const countdown=$('.feedback-countdown');
  const deadline=performance.now()+seconds*1000;
  const updateCountdown=()=>{const label=(correct?'Disappears in (':'Continue in (')+Math.max(1,Math.ceil((deadline-performance.now())/1000))+')';if(countdown.textContent!==label)countdown.textContent=label;};
  updateCountdown();const countdownTimer=setInterval(updateCountdown,50);
  try{await sleep(seconds*1000);}finally{clearInterval(countdownTimer);}
  if(!correct){
    countdown.textContent='Press any key to continue';root.dataset.feedbackReady='true';
    await new Promise(resolve=>{activeKeys=()=>{activeKeys=null;resolve();return true;};});
  }
  delete root.dataset.feedback;delete root.dataset.feedbackPhase;delete root.dataset.feedbackReady;
}
async function learn(){
  learning=new Learning(spec.comparisons,seededRandom(meta.seed^0x4E4734),spec.config.learning_min_accuracy);
  while(!learning.passed){
    const trial=learning.current();await wait(spec.config.fixation_seconds*1000,true);
    const response=await timedQuestion(trial);const row=learning.answer(response.response);
    record({...row,...response});
    await trialFeedback(row.correct,'learning',row.correct?'':spec.magnitude_hint);
    if(!learning.passed)await wait(spec.config.intertrial_seconds*1000);
  }
  persist();
}
async function judgments(english=false){
  const order=shuffle(english?spec.english_judgments:spec.judgments,seededRandom(meta.seed^(english?0x454E47:0x6A756467)));
  for(let i=0;i<order.length;i++){
    const trial=order[i];await wait(spec.config.fixation_seconds*1000,true);
    const response=await timedQuestion(trial);
    const correct=Number(response.response===trial.correct_key);
    record({...trial,...response,presentation_order:i+1,correct});
    await trialFeedback(correct,trial.phase);
    if(i<order.length-1)await wait(spec.config.intertrial_seconds*1000);
  }
}
function fieldFor(q){
  if(q.type==='choice')return '<div class="choices">'+q.options.map(([code,label])=>
    '<label class="choice"><input type="radio" name="demographic" value="'+code+'">'+esc(label)+'</label>').join('')+
    '</div>'+(q.other_code?'<input class="field" id="other" aria-label="Please specify" placeholder="Please specify" hidden>':'');
  if(q.type==='dropdown')return '<select class="field" id="answer" aria-label="'+esc(q.prompt)+'"><option value="">Select an answer</option>'+
    q.options.map(([code,label])=>'<option value="'+code+'">'+esc(label)+'</option>').join('')+'</select>';
  if(q.type==='longtext')return '<textarea class="field" id="answer" aria-label="'+esc(q.prompt)+'"></textarea>';
  return '<input class="field" id="answer" '+(q.type==='integer'?'type="number" min="1" step="1"':'type="text"')+
    ' aria-label="'+esc(q.prompt)+'">';
}
async function demographics(){
  await page(prose(spec.demographics.intro));
  for(const q of spec.demographics.questions){
    const required=q.required!==false&&q.id!=='major';
    draw(prose(q.prompt)+'<form id="demographic-form">'+fieldFor(q)+'<p class="error" id="validation" role="alert"></p>'+
      '<div class="form-actions">'+(required?'':'<button id="skip" type="button">Skip</button>')+'<button type="submit">Continue →</button></div></form>');
    root.dataset.stage='demographics';
    const answer=await new Promise(resolve=>{
      if($('#skip'))$('#skip').onclick=()=>resolve({status:'skipped',value:'',code:'',other:''});
      document.querySelectorAll('input[name="demographic"]').forEach(el=>el.onchange=()=>{
        if($('#other'))$('#other').hidden=Number(el.value)!==q.other_code;
        document.querySelectorAll('.choice').forEach(label=>label.classList.toggle('selected',label.querySelector('input').checked));
      });
      $('#demographic-form').onsubmit=event=>{
        event.preventDefault();let code='',value='',other='';
        if(['choice','dropdown'].includes(q.type)){
          const selected=q.type==='choice'?document.querySelector('input[name="demographic"]:checked'):$('#answer');
          if(!selected||!selected.value){$('#validation').textContent='Please choose an answer.';return;}
          code=Number(selected.value);value=q.options.find(([k])=>k===code)[1];
          if(code===q.other_code){other=$('#other').value.trim();if(!other){$('#validation').textContent='Please specify your language.';return;}}
        }else{
          value=$('#answer').value.trim();
          if(required&&!value){$('#validation').textContent='Please answer this question before continuing.';return;}
          if(value&&q.type==='integer'){
            if(!/^\d+$/.test(value)||Number(value)<1){$('#validation').textContent='Please enter your age in whole years.';return;}
            value=Number(value);
          }
        }
        resolve({status:value===''?'skipped':'answered',value,code,other});
      };
    });answers[q.id]=answer;persist();
  }
}
function download(name,data,type='application/json'){
  const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function finalPayload(){return payload(rows,meta,answers,learning);}
function recoveryButtons(){
  return '<div class="download-actions"><button id="download-backup" type="button">Save response backup</button>'+
    (PREVIEW?'<button id="download-results" type="button">Download results.csv</button><button id="download-passed" type="button">Download magnitude_passed.csv</button>':'')+'</div>';
}
function bindDownloads(){
  $('#download-backup').onclick=()=>download(meta.session+'.json',JSON.stringify(finalPayload(),null,2));
  if(PREVIEW){$('#download-results').onclick=()=>download('results.csv',csv(cleanRows(rows,meta,answers)),'text/csv;charset=utf-8');
    $('#download-passed').onclick=()=>download('magnitude_passed.csv',csv(cleanRows(passingRows(rows,learning),meta,answers)),'text/csv;charset=utf-8');}
}
function showUploadError(message){
  uploading=false;draw('<p>'+esc(message)+'</p><p>Your responses are still available in this tab. Please try again. If the problem continues, save the backup and contact the researcher through Prolific.</p>'+
    '<button id="retry" type="button">Try uploading again</button>'+recoveryButtons());
  root.dataset.stage='upload-error';$('#retry').onclick=submit;bindDownloads();
}
function submit(){
  if(uploading||submitted)return;
  if(!ROUTED){showUploadError('This session did not start through Proliferate.');return;}
  if(!window.proliferate||!window.jQuery){showUploadError('The data upload service could not be loaded.');return;}
  window.jQuery.ajaxSetup({timeout:30000});
  uploading=true;draw('<div id="thanks"><p>Saving your responses. Please keep this page open.</p></div>');root.dataset.stage='uploading';
  // Use the official library. Only its successful server response can authorize completion.
  window.proliferate.submit(finalPayload(),response=>{
    uploading=false;
    let url;
    try{url=new URL(response.completion_URL);
      if(url.protocol!=='https:'||url.hostname!=='app.prolific.com'&&url.hostname!=='app.prolific.co'||
        url.pathname!=='/submissions/complete'||!url.searchParams.get('cc'))throw new Error();
    }catch{showUploadError('Your responses were received, but the completion link is missing or invalid. Contact the researcher before closing this page.');return;}
    submitted=true;try{sessionStorage.removeItem('ng4-active-session');}catch{/* Upload already succeeded. */}
    draw('<p>Thank you. Your responses have been saved.</p><p><a id="completion-link" href="'+esc(url.href)+'">Return to Prolific</a></p>');
    root.dataset.stage='submitted';setTimeout(()=>location.assign(url.href),1500);
  },()=>showUploadError('The upload did not succeed.'));
}
async function finish(){
  finished=true;meta.completed_at=new Date().toISOString();meta.duration_seconds=(Date.now()-Date.parse(meta.started_at))/1000;persist();
  if(PREVIEW){draw('<p>Preview complete. Responses have not been sent to Proliferate.</p>'+recoveryButtons());root.dataset.stage='preview-complete';bindDownloads();}
  else submit();
}
async function run(){
  started=true;meta.started_at=new Date().toISOString();persist();
  try{if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();meta.fullscreen_entered=!!document.fullscreenElement;}}
  catch{/* The participant can still run without fullscreen; its state is recorded. */}
  await pages([...spec.instruction_pages,{body:spec.comprehension_intro}]);
  await comprehension();
  await pages([{body:spec.magnitude_instructions,notes:spec.power_order}]);
  await learn();await pages(spec.task_pages);await judgments();await pages(spec.english_instruction_pages);await judgments(true);await demographics();await finish();
}
function showRecoveredBackup(backup){
  let saved;try{saved=JSON.parse(backup);}catch{saved=null;}
  if(saved?.meta?.completed_at&&saved.learning?.passed&&saved.meta.participant===(ROUTED?credentials[1]:'PREVIEW')&&saved.meta.content_sha256===spec.content_sha256){
    ({meta,rows,answers,learning}=saved);started=true;finished=true;
    draw('<p>Your completed responses are available in this tab.</p><button id="recover-upload" type="button">'+(PREVIEW?'Show preview results':'Upload responses')+'</button>');
    $('#recover-upload').onclick=()=>PREVIEW?finish():submit();return;
  }
  draw('<p>An earlier session in this tab was interrupted. Save its responses before starting again. Please contact the researcher if this was a Prolific session.</p>'+
    '<div class="download-actions"><button id="save-interrupted">Save interrupted session</button><button id="restart">Start a new session</button></div>');
  $('#save-interrupted').onclick=()=>download('ng4-interrupted-session.json',backup);
  $('#restart').onclick=()=>{try{sessionStorage.removeItem('ng4-active-session');}catch{}location.reload();};
}
async function init(){
  const response=await fetch('experiment.json',{cache:'no-store'});if(!response.ok)throw new Error('Experiment content could not be loaded.');
  spec=validateContent(await response.json());
  if(!ROUTED&&!PREVIEW){draw('<p>Please open this experiment using your study link on Prolific.</p>');return;}
  if((credentials.some(Boolean)&&!ROUTED)){draw('<p>The study link is incomplete. Please reopen it from Prolific.</p>');return;}
  if(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)||innerWidth<850){draw('<p>Please use a desktop or laptop computer with a keyboard for this experiment.</p>');return;}
  let backup;try{backup=sessionStorage.getItem('ng4-active-session');}catch{/* Browser storage can be disabled. */}
  if(backup){showRecoveredBackup(backup);return;}
  const seed=crypto.getRandomValues(new Uint32Array(1))[0];
  meta={magnitude_response_labels:'yes_no',version:spec.version,content_sha256:spec.content_sha256,session:'NG4_'+new Date().toISOString().replace(/[:.]/g,'_')+'_'+seed,
    participant:ROUTED?credentials[1]:'PREVIEW',seed,questionnaire_version:spec.demographics.questionnaire_version,
    browser:navigator.userAgent,screen:innerWidth+'x'+innerHeight};
  $('#preview-banner').hidden=!PREVIEW;
  const form=spec.consent_form;
  draw('<section class="consent-form"><h1>'+esc(form.title)+'</h1><div class="consent-reader" tabindex="0" aria-label="Consent form text">'+
    form.paragraphs.map(text=>'<p>'+esc(text).replaceAll('\n','<br>')+'</p>').join('')+'</div>'+
    '<label class="consent-choice"><input type="checkbox" id="consent-accept"> '+esc(form.accept_label)+'</label>'+
    '<button id="begin" type="button" disabled>Continue</button><p class="hint">Select Accept, then press Right Key or Continue.</p></section>');
  root.dataset.stage='consent';
  $('#consent-accept').onchange=()=>$('#begin').disabled=!$('#consent-accept').checked;
  const accept=()=>{
    if(started||!$('#consent-accept').checked)return;
    activeKeys=null;
    meta.consent={accepted:true,choice:form.accept_label,choice_code:form.accept_code,form_version:form.version,text_sha256:form.text_sha256,accepted_at:new Date().toISOString()};
    run().catch(fatal);
  };
  $('#begin').onclick=accept;
  activeKeys=(_,key)=>{if(key==='arrowright') {accept();return true;}return false;};
}
function fatal(error){console.error(error);timing=null;activeKeys=null;persist();
  draw('<p>The experiment could not continue. Please keep this tab open and contact the researcher through Prolific.</p>'+
    '<button id="save-error">Save response backup</button>');root.dataset.stage='error';
  $('#save-error').onclick=()=>download('ng4-interrupted-session.json',JSON.stringify({meta,rows,answers},null,2));
}
init().catch(fatal);
