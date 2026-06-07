# Task List: Checklist Form Type Behavior Adjustments

- [x] Modify `FormTemplates.jsx` (Template Builder)
  - [x] Add "Şube Seçimi Gerekli mi?" checkbox for checklist form types
  - [x] Update `TargetSelector` to support `hidePositions` prop
  - [x] Hide positions for checklist collaborators and watchers (passing `hidePositions={true}`)
  - [x] Hide "Şube Sorumlularını Otomatik Gözlemci Ekle" checkbox for checklist type
  - [x] Display "Formu Dolduran Kişi (Otomatik)" visual banner when branch selection is not required
- [x] Modify `FormSubmissions.jsx` (Form Filling)
  - [x] Render metadata header card for checklist forms (purple theme)
  - [x] Implement conditional branch selector for center/admin users based on `require_branch_selection`
  - [x] Render default branch name as read-only text for branch/warehouse users
  - [x] Add validation to ensure branch is selected if required
  - [x] Resolve submission `branch_id` correctly on submit
- [x] Modify `formService.js` (Backend Services)
  - [x] In `createTaskFromNotification`, assign task directly to submitter when checklist is filled and branch selection is not required
- [x] Android Personnel Application Compilation
  - [x] Fix Kotlin syntax errors in [TasksScreen.kt](file:///c:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt) (broken dropdown loops, missing state variables)
  - [x] Restore declarations of missing state variables (e.g. `recurrenceInterval`, `hasSpecificTime`) and time pickers
  - [x] Register single assignee selection dialog (`SinglePersonnelSelectDialog`)
  - [x] Verify compilation via `.\gradlew.bat assembleDebug` (Build Successful)
- [x] Verify Changes
  - [x] Verify Vite build compilation
  - [x] Manual verification

