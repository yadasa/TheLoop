import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLoop } from '@theloop/client';
import { previewEventCSV, type EventCSVPreview } from '@theloop/core';
import { Button, Chip, Field, Horizontal, Label, s, Section } from './ui';
import type { Nav } from './navigation';

export function ImportEvents({nav}:{nav:Nav}) {
  const {state}=useLoop();const [csv,setCSV]=useState('');const [conferenceId,setConference]=useState(state.conferences[0]?.id||'');const [preview,setPreview]=useState<EventCSVPreview|null>(null);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState(0);
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>Your spreadsheet.{`\n`}Everyone's next plan.</Text>
    <Text style={s.body}>Paste CSV exported from your event spreadsheet. Preview the dates, fix anything that needs care, then add the valid plans to the calendar.</Text>
    <Text style={s.label}>Default conference</Text><Horizontal>{state.conferences.map(c=><Chip key={c.id} title={c.shortName} selected={c.id===conferenceId} onPress={()=>{setConference(c.id);setPreview(null);}}/>)}</Horizontal>
    <View style={s.card}><Text style={s.h3}>The columns to include</Text><Text selectable style={s.small}>title,startAt,endAt,location</Text><Text style={s.small}>Optional: description, timezone, conferenceId, kind, capacity, tags, url. Separate tags with |. Dates use YYYY-MM-DDTHH:mm, with a UTC offset when needed. Default timezone: {timezone}.</Text><Text style={s.small}>This mobile paste accepts up to 200,000 characters. Use the web importer for larger files.</Text></View>
    <Field label="Paste your CSV" value={csv} onChangeText={value=>{setCSV(value);setPreview(null);}} multiline maxLength={200000} placeholder={'title,startAt,endAt,location\nCoffee link-up,2026-11-05T08:00,2026-11-05T09:00,Convention lobby'}/>
    <Button secondary title="Preview my events ↗" disabled={busy||!csv.trim()||!conferenceId} onPress={()=>setPreview(previewEventCSV(csv,{conferences:state.conferences,existingEvents:state.events,defaultConferenceId:conferenceId,defaultTimezone:timezone,now:new Date().toISOString()}))}/>
    {preview&&<><Section title="Before we add them" subtitle={`${preview.events.length} valid · ${preview.rows.filter(r=>r.duplicate).length} duplicates · ${preview.rows.filter(r=>r.errors.length&&!r.duplicate).length} need attention`}/>{preview.errors.map((error,i)=><Text key={i} style={s.body}>{error}</Text>)}{preview.rows.slice(0,50).map(row=><View key={row.row} style={s.card}><Label>{row.duplicate?'DUPLICATE · SKIPPED':row.errors.length?'NEEDS ATTENTION':`ROW ${row.row}`}</Label>{row.event&&<><Text style={s.h3}>{row.event.title}</Text><Text style={s.small}>{new Date(row.event.startAt).toLocaleString()} · {row.event.location}</Text></>}{row.errors.map((error,i)=><Text key={i} style={s.small}>Row {row.row}: {error}</Text>)}</View>)}{preview.rows.length>50&&<Text style={s.small}>Showing the first 50 rows. The import includes every valid row in your preview.</Text>}<Button title={busy?`Adding ${progress} / ${preview.events.length}…`:`Add ${preview.events.length} valid events ↗`} disabled={busy||preview.events.length===0||preview.errors.length>0} onPress={()=>{const drafts=[...preview.events];setBusy(true);setProgress(0);void(async()=>{let added=0;for(const event of drafts){const ok=await nav.run({type:'event.create',event});if(!ok){nav.toast(`${added} events added before the import stopped. Preview again to skip events already added.`);return;}added+=1;setProgress(added);}setCSV('');setPreview(null);nav.toast(`${added} plans added to the calendar`);})().finally(()=>setBusy(false));}}/></>}
    <Text style={s.small}>Duplicates are detected by normalized title and start time. Formula text is treated as data and never executed.</Text>
  </ScrollView>;
}
