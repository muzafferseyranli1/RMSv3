const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

async function run() {
  await client.connect();
  try {
    console.log("Looking up personnel records...");
    const resPers = await client.query("SELECT value FROM settings WHERE key = 'personnel_records'");
    if (resPers.rows.length === 0) {
      throw new Error("No personnel records found in settings");
    }
    const employees = resPers.rows[0].value;
    
    // Find Kemal (approver) and Muzaffer (initiator)
    const kemal = employees.find(e => e.pin === '9999');
    const muzaffer = employees.find(e => e.pin === '1111');
    
    if (!kemal) throw new Error("Kemal (PIN 9999) not found");
    if (!muzaffer) throw new Error("Muzaffer (PIN 1111) not found");
    
    console.log(`Found Muzaffer: ID = ${muzaffer.id}, Kemal: ID = ${kemal.id}`);
    
    // 1. Insert form template for Expense Request
    const schemaJson = {
      sections: [
        {
          id: "sec_expense",
          title: "Masraf Bilgileri",
          fields: [
            {
              id: "f_amount",
              type: "number",
              label: "Masraf Tutarı (TL)",
              required: true
            },
            {
              id: "f_description",
              type: "text",
              label: "Gerekçe / Açıklama",
              required: true
            },
            {
              id: "f_account",
              type: "expense_account_select",
              label: "Gider Hesabı",
              required: true
            },
            {
              id: "f_receipt",
              type: "file",
              label: "Masraf Fişi / Faturası",
              required: false
            }
          ]
        }
      ]
    };
    
    console.log("Inserting form template...");
    const tplInsert = await client.query(
      `INSERT INTO public.form_templates (title, description, form_type, schema_json, active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["Masraf Talebi Form Şablonu", "Masraf talepleri için başlangıç formu", "request", JSON.stringify(schemaJson), true]
    );
    const templateId = tplInsert.rows[0].id;
    console.log(`Inserted form template with ID: ${templateId}`);
    
    // 2. Insert workflow definition
    const blueprint = {
      steps: [
        {
          id: "step_start",
          type: "start",
          name: "Talep Girişi",
          form_template_id: templateId
        },
        {
          id: "step_manager_approval",
          type: "approval",
          name: "Şube Müdürü Onayı",
          assignee_type: "position",
          assignee_id: "seed_pos_sube_muduru"
        },
        {
          id: "step_hq_approval",
          type: "approval",
          name: "Genel Merkez Onayı",
          assignee_type: "personnel",
          assignee_id: kemal.id
        },
        {
          id: "step_end",
          type: "end",
          name: "Tamamlandı"
        }
      ]
    };
    
    console.log("Inserting workflow definition...");
    const defInsert = await client.query(
      `INSERT INTO public.workflow_definitions (name, description, workflow_type, status, version, blueprint) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ["Masraf Onay Süreci", "Masraf taleplerinin hiyerarşik onay akışı", "expense", "published", 1, JSON.stringify(blueprint)]
    );
    const definitionId = defInsert.rows[0].id;
    console.log(`Inserted workflow definition with ID: ${definitionId}`);
    
    console.log("Bootstrap completed successfully!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
