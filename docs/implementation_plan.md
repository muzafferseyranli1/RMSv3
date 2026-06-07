# Checklist Form Type Behavior Adjustments Plan

This plan details the changes required to refine the checklist form type behavior in both the template builder and the form filling sections.

## Proposed Changes

### Frontend Components

---

#### [MODIFY] [FormTemplates.jsx](file:///C:/RMSv3/src/components/pages/FormTemplates.jsx)
1. **Branch Selection Checkbox:**
   - When the form type is `checklist` (`editing.form_type === 'checklist'`), show a checkbox: **"Şube Seçimi Gerekli mi?"**.
   - This value will be stored in `schemaJson.require_branch_selection`.
2. **Restrict Collaborators and Watchers to Center Personnel:**
   - In `TargetSelector` calls for collaborators and watchers, if `editing.form_type === 'checklist'`, pass `hidePositions={true}`.
   - Update `TargetSelector` component to accept `hidePositions` prop. If `hidePositions` is true, do not render or search positions; only show and allow searching center employees (personnel).
3. **Hide Branch Responsibles Watcher Checkbox:**
   - Hide the checkbox **"Şube Sorumlularını Otomatik Gözlemci Ekle"** if `editing.form_type === 'checklist'`.
4. **Primary Assignee Visual Option:**
   - If `editing.form_type === 'checklist'` and `schemaJson.require_branch_selection` is NOT checked:
     - Replace the primary assignee target selector with a read-only visual banner: **"Formu Dolduran Kişi (Otomatik)"** to indicate that the person who submits the form will be assigned.

---

#### [MODIFY] [FormSubmissions.jsx](file:///C:/RMSv3/src/components/pages/FormSubmissions.jsx)
1. **Checklist Metadata Header:**
   - Display a metadata/info card for checklists (`template.form_type === 'checklist'`), styled with a purple theme (`#8b5cf6`).
   - The card will include the **"Sistem Tarih ve Saatini Otomatik Kullan"** checkbox.
   - Under the card, show **Formu Dolduran** (disabled name) and **Tarih/Saat** inputs.
   - For **Şube / Denetim Noktası**:
     - If the active user has a branch/warehouse scope, show their branch name as read-only text (automatically resolved from their default branch).
     - If the active user has a center/admin scope:
       - If `template.schema_json?.require_branch_selection` is true, show the branch selection dropdown.
       - If `template.schema_json?.require_branch_selection` is false, hide the branch selector entirely.
2. **Form Submission Validation:**
   - If `template.form_type === 'checklist'`, the active user is in center/admin scope, and `template.schema_json?.require_branch_selection` is true, check that a branch is selected before submitting.
3. **Submission Payload branch_id:**
   - When submitting a checklist:
     - If center/admin and `require_branch_selection` is true, use the selected `metaBranchId`. If false, submit `null` (since no branch is required/selected).
     - If branch/warehouse employee, submit their default branch ID.

---

### Android Mobile Applications

#### [MODIFY] [TasksScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt)
1. **Restore State Declarations:**
   - Restored missing remember-based state variables (e.g. `hasSpecificTime`, `startTime`, `dueTime`, `recurrenceInterval`, `recurrenceWeekdays`, `monthlyPattern`, `monthlyDayOfMonth`, `monthlyNth`, `monthlyWeekday`, `yearlyPattern`, `yearlyDates`, rules flags, `selectedTemplateId`, `checklistInputs`, collapsible flags, dialog triggers, and `isCreating`).
2. **Restore Time Picker Dialogs:**
   - Re-instated `startTimePickerDialog` and `dueTimePickerDialog` instances to enable time configurations during task creation.
3. **Fix Syntax/Brace Layout in dialog:**
   - Repaired the broken DropdownMenuItem leftover code under `isParticipantsExpanded` condition by introducing a proper `Column` containing the single-assignee selection field (`responsibleName`), which triggers `showRespSelectDialog = true`.
4. **Wire Single Assignee Select Dialog:**
   - Invoked the `SinglePersonnelSelectDialog` at the end of the `CreateTaskDialog` composable block, ensuring it filters by center employees (`authorityLevel === 'Genel Merkez'`).

---

### Backend Services & Database Integration

#### [MODIFY] [formService.js](file:///C:/RMSv3/src/lib/formService.js)
1. **Auto-Created Task Assignee:**
   - In `createTaskFromNotification`, if `template.form_type === 'checklist'` and `template.schema_json?.require_branch_selection` is false (or not checked):
     - Bypass normal assignee resolution rules and assign the task directly to the form submitter: add `String(submission.submitted_by)` to `assigneeIds`.
2. **Safety checks:**
   - Ensure `worksAtBranch` resolves gracefully when `branchNodeId` is null (returns true, which is standard behavior).

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify the React frontend compiles without errors.
- Run `.\gradlew.bat assembleDebug` in `personel-android/` to verify the Android Personnel application compiles successfully.

### Manual Verification
1. **Builder UI:**
   - Go to Form Templates, edit or create a Checklist.
   - Confirm **"Şube Seçimi Gerekli mi?"** checkbox exists.
   - When unchecked, confirm the Birincil Sorumlu (Atanan) field displays "Formu Dolduran Kişi (Otomatik)".
   - Confirm that positions option is hidden from Collaborators and Watchers target selectors.
   - Confirm **"Şube Sorumlularını Otomatik Gözlemci Ekle"** checkbox is hidden.
2. **Form Filling UI:**
   - Go to Form Filling as a branch user. Fill the checklist and verify their default branch is auto-selected and displayed as read-only. Verify the header card exists.
   - Go to Form Filling as a center employee:
     - For a checklist template with `require_branch_selection: true`, verify the branch selection dropdown is visible.
     - For a checklist template with `require_branch_selection: false`, verify the branch selection is hidden.
3. **Task Creation:**
   - Submit a checklist form with auto-task enabled and `require_branch_selection: false`. Verify that the auto-created task is assigned to the submitter.
