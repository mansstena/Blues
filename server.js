
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import pkg from 'pg'
import PDFDocument from 'pdfkit'
import { format } from 'date-fns'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json({limit:'5mb'}))

const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ''

function requireAdmin(req,res,next){
  const key = req.headers['x-admin-key']
  if(!ADMIN_API_KEY || key !== ADMIN_API_KEY) return res.status(401).json({error:'Unauthorized'})
  next()
}

app.get('/health', (req,res)=> res.json({ok:true, ts: new Date().toISOString()}))

// Seed minimal demo data
async function seed(){
  await pool.query("insert into clients(name) values ('Nordic AB') on conflict do nothing")
  const j = await pool.query('select count(*) from jobs')
  if(Number(j.rows[0].count)===0){
    await pool.query("insert into jobs(title,client,description) values ('HR-generalist','Nordic AB','Bredd i HR, systemvana'), ('Truckförare','Logiscan','Behörighet A+B, skift')")
  }
  const c = await pool.query('select count(*) from consultants')
  if(Number(c.rows[0].count)===0){
    await pool.query("insert into consultants(code,name,role,hourly_wage) values ('C-001','Anna Svensson','Sjuksköterska',250),('C-002','Jonas Berg','Truckförare',180)")
  }
  const i = await pool.query('select count(*) from invoices')
  if(Number(i.rows[0].count)===0){
    await pool.query("insert into invoices(client_id,amount,type) values ((select id from clients limit 1),114000,'Rekrytering')")
  }
  const p = await pool.query('select count(*) from payroll')
  if(Number(p.rows[0].count)===0){
    await pool.query("insert into payroll(consultant_id,month,gross,status) values (1,'2025-08',41250,'Planerad')")
  }
}
seed().catch(console.error)

// Orders -> create invoice draft
app.post('/api/orders', async (req,res)=>{
  const payload = req.body
  const { client, price_incl_vat } = payload
  let clientId
  const found = await pool.query('select id from clients where name=$1 limit 1',[client])
  if(found.rows.length){ clientId = found.rows[0].id }
  else { const ins = await pool.query('insert into clients(name) values($1) returning id',[client||'Okänd kund']); clientId = ins.rows[0].id }
  const inv = await pool.query('insert into invoices(client_id, amount, type, payload) values ($1,$2,$3,$4) returning *',[clientId, price_incl_vat, payload.orderType==='bemanning'?'Bemanning':'Rekrytering', payload])
  res.json(inv.rows[0])
})

// Invoices list & PDF
app.get('/api/invoices', async (req,res)=>{
  const q = await pool.query("select invoices.id, coalesce(clients.name,'-') as client, to_char(invoices.date,'YYYY-MM-DD') as date, invoices.amount, invoices.type from invoices left join clients on clients.id=invoices.client_id order by invoices.id desc")
  res.json(q.rows)
})
app.get('/api/invoices/:id/pdf', async (req,res)=>{
  const id = req.params.id
  const q = await pool.query("select invoices.*, clients.name as client from invoices left join clients on clients.id=invoices.client_id where invoices.id=$1",[id])
  if(!q.rows.length) return res.sendStatus(404)
  const row = q.rows[0]
  const doc = new PDFDocument({ size:'A4', margin:50 })
  res.setHeader('Content-Type', 'application/pdf')
  doc.pipe(res)
  header(doc, 'Faktura')
  doc.text(`Kund: ${row.client||''}`)
    .text(`Datum: ${format(new Date(row.date), 'yyyy-MM-dd')}`)
    .text(`Belopp: ${row.amount} kr (inkl. moms)`) 
    .text(`Typ: ${row.type}`)
  footer(doc)
  doc.end()
})

// Consultant endpoints
app.get('/api/consultant/payrolls', async (req,res)=>{
  const q = await pool.query("select id, month from payroll order by id desc")
  res.json(q.rows)
})
app.get('/api/consultant/shifts', async (req,res)=>{
  const q = await pool.query("select assignments.id, to_char(assignments.start_ts,'YYYY-MM-DD HH24:MI') as start, to_char(assignments.end_ts,'YYYY-MM-DD HH24:MI') as end, clients.name as client, assignments.place from assignments left join clients on clients.id=assignments.client_id order by assignments.id desc")
  res.json(q.rows)
})
app.get('/api/payrolls/:id/pdf', async (req,res)=>{
  const id = req.params.id
  const q = await pool.query("select payroll.*, consultants.name as cname from payroll left join consultants on consultants.id=payroll.consultant_id where payroll.id=$1",[id])
  if(!q.rows.length) return res.sendStatus(404)
  const row = q.rows[0]
  const doc = new PDFDocument({ size:'A4', margin:50 })
  res.setHeader('Content-Type', 'application/pdf')
  doc.pipe(res)
  header(doc, 'Lönespecifikation')
  doc.text(`Namn: ${row.cname || ''}`)
    .text(`Månad: ${row.month}`)
    .text(`Brutto: ${row.gross} kr`)
    .text(`Status: ${row.status}`)
  footer(doc)
  doc.end()
})

// Contact (mock)
app.post('/api/contact', async (req,res)=>{ res.json({ok:true}) })

// Jobs public
app.get('/api/jobs', async (req,res)=>{
  const q = await pool.query("select id, title, client, description, to_char(created_at,'YYYY-MM-DD') as created_at from jobs order by id desc")
  res.json(q.rows)
})
app.get('/api/jobs/:id', async (req,res)=>{
  const q = await pool.query("select id, title, client, description, to_char(created_at,'YYYY-MM-DD') as created_at from jobs where id=$1",[req.params.id])
  if(!q.rows.length) return res.sendStatus(404)
  res.json(q.rows[0])
})

// Jobs admin
app.post('/api/jobs', requireAdmin, async (req,res)=>{
  const { title, client, description } = req.body
  const q = await pool.query('insert into jobs(title,client,description) values ($1,$2,$3) returning *',[title, client, description])
  res.json(q.rows[0])
})
app.put('/api/jobs/:id', requireAdmin, async (req,res)=>{
  const { title, client, description } = req.body
  const q = await pool.query('update jobs set title=$1, client=$2, description=$3 where id=$4 returning *',[title, client, description, req.params.id])
  res.json(q.rows[0])
})
app.delete('/api/jobs/:id', requireAdmin, async (req,res)=>{
  await pool.query('delete from jobs where id=$1',[req.params.id])
  res.json({ok:true})
})

// Candidates
app.get('/api/candidates', requireAdmin, async (req,res)=>{
  const jobId = req.query.job_id
  const q = await pool.query('select * from candidates where job_id=$1 order by id desc',[jobId])
  res.json(q.rows)
})
app.post('/api/candidates', async (req,res)=>{
  const { job_id, name, email, cv_url } = req.body
  const q = await pool.query('insert into candidates(job_id,name,email,cv_url) values ($1,$2,$3,$4) returning *',[job_id, name, email, cv_url])
  res.json(q.rows[0])
})
app.put('/api/candidates/:id', requireAdmin, async (req,res)=>{
  const { rating, notes } = req.body
  const q = await pool.query('update candidates set rating=$1, notes=$2 where id=$3 returning *',[rating, notes, req.params.id])
  res.json(q.rows[0])
})

function header(doc, title){
  doc.fontSize(18).text(process.env.COMPANY_NAME || 'BR')
  doc.moveDown(0.3)
  doc.fontSize(10).fillColor('gray').text(process.env.COMPANY_ADDRESS||'')
  doc.moveDown(0.8).fillColor('black')
  doc.fontSize(16).text(title)
  doc.moveDown(0.5)
}
function footer(doc){
  doc.moveDown(2)
  doc.fontSize(9).fillColor('gray').text(`Org.nr: ${process.env.COMPANY_ORGNR || ''}`)
  doc.text(`Genererad: ${new Date().toISOString()}`)
}

const port = process.env.PORT || 10000
app.listen(port, ()=> console.log('Server running on :' + port))
