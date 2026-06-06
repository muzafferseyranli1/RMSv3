# Task List: Responsive Layout & Secondary Shelf Life

- [x] Add input fields for advanced metadata in `ManualManagement.jsx`
  - [x] Add collapsible "Mutfak Operasyon Detayları ve Raf Ömrü" form section
  - [x] Add inputs for prep, thaw, cooling time, allergens, and portion weight
  - [x] Add primary storage condition & shelf life inputs
  - [x] Add secondary storage condition & shelf life inputs (Situation 1 & 2)
  - [x] Update state initialization and handleSavePage payload
- [x] Render advanced metadata in `ManualManagement.jsx` page preview
  - [x] Apply responsive cards layout for filled metadata
- [x] Render advanced metadata in `ManualReader.jsx` (Okuyucu) page view
  - [x] Create a premium responsive grid/pills layout for active metadata fields
  - [x] Display Secondary Shelf Life ("2. Raf Ömrü") timeline/grid comparison
- [x] Implement responsive layout adjustments and `@media print` CSS rules
  - [x] Remove fixed A4 aspect-ratio sizing on web screen to support fluid layout on mobile
  - [x] Add `@media print` styling to hide navigation/sidebar and format content for standard A4 sheets when printed/PDF saved
- [x] Verify build and functionality
  - [x] Verify build compiles cleanly with `npm run build`
  - [x] Push to repository for deployment
