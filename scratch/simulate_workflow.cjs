const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway' });

function nowIso() {
  return new Date().toISOString();
}

async function run() {
  await client.connect();
  try {
    console.log("=== 1. PREPARATION & LOOKUP ===");
    // Get definition
    const defRes = await client.query("SELECT * FROM workflow_definitions WHERE id = '7f4d0671-516c-45ae-b1d7-58d4871a4330'");
    if (defRes.rows.length === 0) {
      throw new Error("Definition not found. Please run seed script first.");
    }
    const definition = defRes.rows[0];
    const steps = definition.blueprint.steps;
    console.log("Found Workflow Definition:", definition.name, `with ${steps.length} steps.`);

    // Load personnel records from settings
    const resPers = await client.query("SELECT value FROM settings WHERE key = 'personnel_records'");
    const employees = resPers.rows[0].value;
    
    // Find initiator (Muzaffer), Branch Manager, and HQ Approver (Kemal)
    const initiator = employees.find(e => e.pin === '1111'); // Muzaffer
    const hqApprover = employees.find(e => e.pin === '9999'); // Kemal
    const manager = employees.find(e => String(e.positionId) === 'seed_pos_sube_muduru' && !e.deletedAt);

    if (!initiator) throw new Error("Initiator (Muzaffer) not found");
    if (!hqApprover) throw new Error("HQ Approver (Kemal) not found");
    if (!manager) throw new Error("Branch Manager not found");

    console.log(`Initiator (Muzaffer): ${initiator.id} (${initiator.firstName})`);
    console.log(`Branch Manager: ${manager.id} (${manager.firstName})`);
    console.log(`HQ Approver (Kemal): ${hqApprover.id} (${hqApprover.firstName})`);

    // Clean up any previous test instances
    console.log("Cleaning up previous test records...");
    await client.query("DELETE FROM workflow_history WHERE instance_id IN (SELECT id FROM workflow_instances WHERE definition_id = $1)", [definition.id]);
    await client.query("DELETE FROM tasks WHERE linked_entity_table = 'workflow_instances' AND linked_entity_id IN (SELECT id FROM workflow_instances WHERE definition_id = $1)", [definition.id]);
    await client.query("DELETE FROM workflow_instances WHERE definition_id = $1", [definition.id]);

    console.log("\n=== 2. INITIATE WORKFLOW ===");
    const contextData = {
      f_amount: 1500,
      f_description: "İş yemeği masrafı",
      f_account: "770.01.002",
      f_receipt: "/api/files/receipt_test.jpg",
      branch_id: initiator.defaultBranchId || null
    };

    const startStep = steps.find(s => s.type === 'start');
    
    // Create Workflow Instance
    const instInsert = await client.query(
      `INSERT INTO public.workflow_instances (definition_id, definition_version, current_node_id, status, context_data, started_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [definition.id, definition.version, startStep.id, 'running', JSON.stringify(contextData), initiator.id]
    );
    const instance = instInsert.rows[0];
    console.log(`Workflow Instance created: ${instance.id}, current node: ${instance.current_node_id}`);

    // Insert history for start step
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes, delta_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [instance.id, null, startStep.id, 'submit', initiator.id, 'Talep oluşturuldu.', JSON.stringify(contextData)]
    );

    console.log("\n=== 3. ADVANCE TO NEXT STEP (Branch Manager Approval) ===");
    // Find next step after start
    const currentIndex = steps.findIndex(s => s.id === startStep.id);
    const nextStep = steps[currentIndex + 1];
    console.log(`Advancing from ${startStep.id} to ${nextStep.id} (${nextStep.name})...`);

    // Update instance node
    await client.query(
      "UPDATE workflow_instances SET current_node_id = $1 WHERE id = $2",
      [nextStep.id, instance.id]
    );

    // Write transition log
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instance.id, startStep.id, nextStep.id, 'transition', 'system', `${nextStep.name} adımına geçildi.`]
    );

    // Create approval task for Branch Manager position
    const taskTitle = `Onay Talebi: Masraf Onay Süreci (${nextStep.name})`;
    const taskDesc = `Talep Sahibi: ${initiator.firstName} ${initiator.lastName}\nAçıklama: Lütfen bu talebi inceleyerek onaylayın veya reddedin.`;
    
    const taskInsert = await client.query(
      `INSERT INTO public.tasks (title, description, status, priority, linked_entity_table, linked_entity_id, branch_node_id, created_by_personnel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [taskTitle, taskDesc, 'open', 'high', 'workflow_instances', instance.id, contextData.branch_id, initiator.id]
    );
    const task = taskInsert.rows[0];
    console.log(`Task created for Şube Müdürü: ID = ${task.id}, Title = "${task.title}"`);

    // Assign to employees in "seed_pos_sube_muduru" position
    const matches = employees.filter(e => String(e.positionId) === nextStep.assignee_id && !e.deletedAt && !e.terminationDate);
    console.log(`Found ${matches.length} active employee(s) in position ${nextStep.assignee_id}`);
    
    const participantRows = matches.map(e => [task.id, 'assignee', String(e.id), nextStep.assignee_id]);
    for (const row of participantRows) {
      await client.query(
        `INSERT INTO public.task_participants (task_id, participant_type, personnel_id, position_id)
         VALUES ($1, $2, $3, $4)`,
        row
      );
    }
    console.log(`Assigned task participants for managers.`);

    // Verify task assignment
    const verifyPart = await client.query("SELECT * FROM task_participants WHERE task_id = $1", [task.id]);
    console.log(`Verified ${verifyPart.rows.length} participant row(s) in database.`);

    console.log("\n=== 4. SIMULATE MANAGER APPROVAL ===");
    // Manager approves
    console.log(`Manager (${manager.firstName}) approving...`);
    
    // Close active tasks
    await client.query(
      "UPDATE task_participants SET is_completed = true WHERE task_id = $1 AND personnel_id = $2",
      [task.id, manager.id]
    );
    await client.query(
      "UPDATE tasks SET status = 'completed', closure_summary = 'Onaylandı: Şube Müdürü uygun gördü.' WHERE id = $1",
      [task.id]
    );
    console.log("Closed active manager task.");

    // Write approval history log
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instance.id, nextStep.id, nextStep.id, 'approve', manager.id, 'Şube Müdürü uygun gördü.']
    );

    console.log("\n=== 5. ADVANCE TO NEXT STEP (Genel Merkez Onayı) ===");
    const nextIndex = steps.findIndex(s => s.id === nextStep.id);
    const hqStep = steps[nextIndex + 1];
    console.log(`Advancing from ${nextStep.id} to ${hqStep.id} (${hqStep.name})...`);

    // Update instance node to HQ
    await client.query(
      "UPDATE workflow_instances SET current_node_id = $1 WHERE id = $2",
      [hqStep.id, instance.id]
    );

    // Write transition log
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instance.id, nextStep.id, hqStep.id, 'transition', 'system', `${hqStep.name} adımına geçildi.`]
    );

    // Create approval task for HQ Approver (Kemal)
    const hqTaskTitle = `Onay Talebi: Masraf Onay Süreci (${hqStep.name})`;
    const hqTaskDesc = `Talep Sahibi: ${initiator.firstName} ${initiator.lastName}\nAçıklama: Şube müdürü onayladı. Genel Merkez onayı gerekiyor.`;
    
    const hqTaskInsert = await client.query(
      `INSERT INTO public.tasks (title, description, status, priority, linked_entity_table, linked_entity_id, branch_node_id, created_by_personnel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [hqTaskTitle, hqTaskDesc, 'open', 'high', 'workflow_instances', instance.id, contextData.branch_id, manager.id]
    );
    const hqTask = hqTaskInsert.rows[0];
    console.log(`Task created for Kemal (HQ): ID = ${hqTask.id}, Title = "${hqTask.title}"`);

    // Assign directly to Kemal
    await client.query(
      `INSERT INTO public.task_participants (task_id, participant_type, personnel_id, position_id)
       VALUES ($1, $2, $3, $4)`,
      [hqTask.id, 'assignee', hqApprover.id, hqApprover.positionId || null]
    );
    console.log(`Assigned task participant to Kemal.`);

    console.log("\n=== 6. SIMULATE HQ (KEMAL) APPROVAL ===");
    console.log(`Kemal approving...`);
    
    // Close HQ task
    await client.query(
      "UPDATE task_participants SET is_completed = true WHERE task_id = $1 AND personnel_id = $2",
      [hqTask.id, hqApprover.id]
    );
    await client.query(
      "UPDATE tasks SET status = 'completed', closure_summary = 'Onaylandı: Genel Merkez onayladı. Bütçe uygun.' WHERE id = $1",
      [hqTask.id]
    );
    console.log("Closed active HQ task.");

    // Write approval history log
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instance.id, hqStep.id, hqStep.id, 'approve', hqApprover.id, 'Genel Merkez onayladı. Bütçe uygun.']
    );

    console.log("\n=== 7. ADVANCE TO END (Complete Workflow) ===");
    const hqIndex = steps.findIndex(s => s.id === hqStep.id);
    const endStep = steps[hqIndex + 1];
    console.log(`Advancing from ${hqStep.id} to ${endStep.id} (${endStep.name})...`);

    // Update instance status to completed
    const finalUpdate = await client.query(
      "UPDATE workflow_instances SET current_node_id = $1, status = 'completed', completed_at = $2 WHERE id = $3 RETURNING *",
      [endStep.id, nowIso(), instance.id]
    );
    const completedInstance = finalUpdate.rows[0];
    
    // Write complete log
    await client.query(
      `INSERT INTO public.workflow_history (instance_id, from_node_id, to_node_id, action, actor_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instance.id, hqStep.id, 'completed', 'complete', 'system', 'İş akışı başarıyla tamamlandı.']
    );
    
    console.log(`Workflow Instance completed successfully! Final Status: ${completedInstance.status}, Completed At: ${completedInstance.completed_at}`);

    console.log("\n=== 8. VERIFY FINAL DATABASE RECORDS ===");
    const historyRows = await client.query("SELECT * FROM workflow_history WHERE instance_id = $1 ORDER BY created_at ASC", [instance.id]);
    console.log("Workflow History Timeline Logs:");
    historyRows.rows.forEach((h, idx) => {
      console.log(`  [${idx + 1}] Action: ${h.action.padEnd(12)} | From: ${(h.from_node_id || 'START').padEnd(22)} | To: ${h.to_node_id.padEnd(22)} | Actor: ${h.actor_id.padEnd(25)} | Notes: ${h.notes || '-'}`);
    });

    console.log("\nSimulation test passed successfully!");
  } catch (err) {
    console.error("Simulation failed:", err);
  } finally {
    await client.end();
  }
}
run();
