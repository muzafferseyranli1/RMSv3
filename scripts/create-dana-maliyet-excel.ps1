$ErrorActionPreference = 'Stop'

$outputPath = Join-Path (Get-Location) 'dana_eti_tek_tablo_3_maliyet_yontemi.xlsx'

function XmlEscape([object]$value) {
  if ($null -eq $value) { return '' }
  return [System.Security.SecurityElement]::Escape([string]$value)
}

function ColName([int]$number) {
  $name = ''
  while ($number -gt 0) {
    $number--
    $name = [char](65 + ($number % 26)) + $name
    $number = [math]::Floor($number / 26)
  }
  return $name
}

function CellXml([string]$ref, [object]$value, [int]$style = 0, [string]$kind = 'auto') {
  if ($kind -eq 'formula') {
    return "<c r=""$ref"" s=""$style""><f>$(XmlEscape $value)</f></c>"
  }
  if ($null -eq $value -or $value -eq '') {
    return "<c r=""$ref"" s=""$style""/>"
  }
  if ($kind -eq 'string' -or $value -is [string]) {
    return "<c r=""$ref"" s=""$style"" t=""inlineStr""><is><t>$(XmlEscape $value)</t></is></c>"
  }
  $num = ([string]$value).Replace(',', '.')
  return "<c r=""$ref"" s=""$style""><v>$num</v></c>"
}

function RowXml([int]$rowNumber, [array]$cells, [double]$height = 0) {
  $attrs = "r=""$rowNumber"""
  if ($height -gt 0) { $attrs += " ht=""$height"" customHeight=""1""" }
  return "<row $attrs>$($cells -join '')</row>"
}

function AddEntry($zip, [string]$name, [string]$content) {
  $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
  $writer.Write($content)
  $writer.Dispose()
}

$movements = @(
  [pscustomobject]@{ No=1; Date='2026-06-01 09:00'; Id='GR-001'; Type='Alış girişi'; In=60; Out=0; Price=420; Note='İlk Dana eti alımı' },
  [pscustomobject]@{ No=2; Date='2026-06-01 13:00'; Id='CK-001'; Type='Reçete tüketimi'; In=0; Out=22; Price=$null; Note='Öğle servis tüketimi' },
  [pscustomobject]@{ No=3; Date='2026-06-02 20:30'; Id='CK-002'; Type='Reçete tüketimi'; In=0; Out=30; Price=$null; Note='Akşam servis tüketimi' },
  [pscustomobject]@{ No=4; Date='2026-06-03 10:15'; Id='GR-002'; Type='Alış girişi'; In=40; Out=0; Price=455; Note='Fiyat artışlı alım' },
  [pscustomobject]@{ No=5; Date='2026-06-03 19:00'; Id='CK-003'; Type='Reçete tüketimi'; In=0; Out=15; Price=$null; Note='Servis tüketimi' },
  [pscustomobject]@{ No=6; Date='2026-06-04 08:30'; Id='FIR-001'; Type='Fire/trim'; In=0; Out=5; Price=$null; Note='Temizleme firesi' },
  [pscustomobject]@{ No=7; Date='2026-06-04 11:00'; Id='GR-003'; Type='Alış girişi'; In=25; Out=0; Price=470; Note='Yeni parti alım' },
  [pscustomobject]@{ No=8; Date='2026-06-05 21:30'; Id='CK-004'; Type='Reçete tüketimi'; In=0; Out=38; Price=$null; Note='Yoğun servis tüketimi' },
  [pscustomobject]@{ No=9; Date='2026-06-06 22:00'; Id='CK-005'; Type='Reçete tüketimi'; In=0; Out=24; Price=$null; Note='NEGATİF STOK: kayıt fiili stoktan fazla tüketim gösteriyor' },
  [pscustomobject]@{ No=10; Date='2026-06-07 09:20'; Id='GR-004'; Type='Alış girişi'; In=20; Out=0; Price=510; Note='Negatif stok kapatma alımı' },
  [pscustomobject]@{ No=11; Date='2026-06-07 15:00'; Id='CK-006'; Type='Reçete tüketimi'; In=0; Out=6; Price=$null; Note='Servis tüketimi' },
  [pscustomobject]@{ No=12; Date='2026-06-08 10:00'; Id='GR-005'; Type='Alış girişi'; In=50; Out=0; Price=530; Note='Haftalık alım' },
  [pscustomobject]@{ No=13; Date='2026-06-08 22:15'; Id='CK-007'; Type='Reçete tüketimi'; In=0; Out=35; Price=$null; Note='Akşam servis tüketimi' },
  [pscustomobject]@{ No=14; Date='2026-06-09 22:30'; Id='CK-008'; Type='Reçete tüketimi'; In=0; Out=28; Price=$null; Note='NEGATİF STOK: ikinci açık' },
  [pscustomobject]@{ No=15; Date='2026-06-10 09:10'; Id='GR-006'; Type='Alış girişi'; In=20; Out=0; Price=560; Note='Negatif stok kapatma alımı' },
  [pscustomobject]@{ No=16; Date='2026-06-10 18:00'; Id='SYM-001'; Type='Sayım fazlası'; In=10; Out=0; Price=550; Note='Sayım farkı girişi' },
  [pscustomobject]@{ No=17; Date='2026-06-11 14:00'; Id='CK-009'; Type='Reçete tüketimi'; In=0; Out=20; Price=$null; Note='Servis tüketimi' }
)

$lots = New-Object System.Collections.Generic.List[object]
$fifoNegativeDebt = 0.0
$lastKnownFifoCost = 0.0
$fifoRows = @()

foreach ($m in $movements) {
  $fifoUnit = $null
  $fifoMoveCost = 0.0
  $fifoNegKg = 0.0
  $fifoNegUnit = $null
  $fifoNote = ''

  if ($m.In -gt 0) {
    $remainingIn = [double]$m.In
    $lastKnownFifoCost = [double]$m.Price
    if ($fifoNegativeDebt -gt 0) {
      $covered = [math]::Min($remainingIn, $fifoNegativeDebt)
      $fifoNegativeDebt -= $covered
      $remainingIn -= $covered
      $fifoNote = "Önceki negatif stoktan $covered kg kapandı"
    }
    if ($remainingIn -gt 0) {
      $lots.Add([pscustomobject]@{ Qty=$remainingIn; Unit=[double]$m.Price })
      if ($fifoNote) { $fifoNote += '; ' }
      $fifoNote += "$remainingIn kg yeni FIFO lotu açıldı"
    }
    $fifoMoveCost = [double]$m.In * [double]$m.Price
  } elseif ($m.Out -gt 0) {
    $remainingOut = [double]$m.Out
    $cost = 0.0
    while ($remainingOut -gt 0 -and $lots.Count -gt 0) {
      $lot = $lots[0]
      $take = [math]::Min($remainingOut, [double]$lot.Qty)
      $cost += $take * [double]$lot.Unit
      $lot.Qty = [double]$lot.Qty - $take
      $remainingOut -= $take
      $lastKnownFifoCost = [double]$lot.Unit
      if ([double]$lot.Qty -le 0.0000001) {
        $lots.RemoveAt(0)
      }
    }
    if ($remainingOut -gt 0) {
      $fifoNegKg = $remainingOut
      $fifoNegUnit = if ($lastKnownFifoCost -gt 0) { $lastKnownFifoCost } else { 0 }
      $cost += $remainingOut * [double]$fifoNegUnit
      $fifoNegativeDebt += $remainingOut
      $fifoNote = "Mevcut FIFO lotu yetmedi; $remainingOut kg negatif stok olarak maliyetlendi"
    }
    $fifoMoveCost = $cost
    $fifoUnit = if ($m.Out -gt 0) { $cost / [double]$m.Out } else { $null }
  }

  $openQty = 0.0
  $openValue = 0.0
  foreach ($lot in $lots) {
    $openQty += [double]$lot.Qty
    $openValue += [double]$lot.Qty * [double]$lot.Unit
  }
  if ($fifoNegativeDebt -gt 0) {
    $openQty -= $fifoNegativeDebt
    $openValue -= $fifoNegativeDebt * $lastKnownFifoCost
  }

  $fifoRows += [pscustomobject]@{
    Unit = $fifoUnit
    MoveCost = $fifoMoveCost
    OpenQty = $openQty
    OpenValue = $openValue
    NegKg = $fifoNegKg
    NegUnit = $fifoNegUnit
    Note = $fifoNote
  }
}

$headers = @(
  'No','Tarih/Saat','Hareket ID','Hareket Tipi','Girdi kg','Çıktı kg','Alış birim fiyatı','Açıklama',
  'WAC önceki kg','WAC önceki değer','WAC çıkış birim','WAC hareket maliyeti','WAC bakiye kg','WAC bakiye değer','WAC ortalama birim',
  'FIFO çıkış birim','FIFO hareket maliyeti','FIFO açık lot kg','FIFO açık lot değeri','FIFO negatif kg','FIFO negatif birim','FIFO notu',
  'Son alış birim','Son alış hareket maliyeti','Son alış bakiye kg','Son alış bakiye değer',
  'Seçili yöntem birim','Seçili yöntem hareket maliyeti','Seçili yöntem bakiye kg','Seçili yöntem bakiye değer','Stok durumu'
)

$rows = New-Object System.Collections.Generic.List[string]
$rows.Add((RowXml 1 @((CellXml 'A1' 'Dana Eti - Tek Tabloda 3 Maliyet Yöntemi Simülasyonu' 1 'string')) 24))
$rows.Add((RowXml 2 @((CellXml 'A2' 'Tablo nesnesi kullanılmadı; renkli kolon grupları normal hücre aralığıdır. Negatif stok satırları ayrıca işaretlenmiştir.' 2 'string')) 18))
$rows.Add((RowXml 3 @((CellXml 'A3' 'Resmi maliyet yöntemi seçimi' 15 'string'), (CellXml 'B3' 'Ağırlıklı Ortalama' 3 'string'), (CellXml 'D3' 'B3 hücresinden yöntemi değiştir: Ağırlıklı Ortalama / FIFO / Son Alış' 15 'string')) 18))
$rows.Add((RowXml 4 @((CellXml 'A4' 'Ürün' 15 'string'), (CellXml 'B4' 'Dana eti' 3 'string'), (CellXml 'D4' 'Birim' 15 'string'), (CellXml 'E4' 'kg' 3 'string')) 18))
$rows.Add((RowXml 5 @((CellXml 'A5' 'Renkler' 15 'string'), (CellXml 'B5' 'Gri: ortak hareket, Mavi: ağırlıklı ortalama, Yeşil: FIFO, Turuncu: son alış, Mor: seçili resmi yöntem' 15 'string')) 18))
$rows.Add((RowXml 6 @() 8))
$rows.Add((RowXml 7 @(
  (CellXml 'A7' 'Ortak hareket verisi' 4 'string'),
  (CellXml 'I7' 'Ağırlıklı Ortalama / WAC' 6 'string'),
  (CellXml 'P7' 'FIFO' 8 'string'),
  (CellXml 'W7' 'Son Alış Fiyatı' 10 'string'),
  (CellXml 'AA7' 'Seçili resmi yöntem' 12 'string')
) 20))

$headerCells = @()
for ($i = 0; $i -lt $headers.Count; $i++) {
  $col = ColName ($i + 1)
  $style = 4
  if ($i -ge 8 -and $i -le 14) { $style = 6 }
  elseif ($i -ge 15 -and $i -le 21) { $style = 8 }
  elseif ($i -ge 22 -and $i -le 25) { $style = 10 }
  elseif ($i -ge 26) { $style = 12 }
  $headerCells += (CellXml "$col`8" $headers[$i] $style 'string')
}
$rows.Add((RowXml 8 $headerCells 36))

$startRow = 9
for ($idx = 0; $idx -lt $movements.Count; $idx++) {
  $m = $movements[$idx]
  $f = $fifoRows[$idx]
  $r = $startRow + $idx
  $prev = $r - 1

  $dataStyle = if ($m.Note -like 'NEGATİF STOK*') { 14 } else { 5 }
  $wacStyle = if ($m.Note -like 'NEGATİF STOK*') { 14 } else { 7 }
  $fifoStyle = if ($m.Note -like 'NEGATİF STOK*' -or $f.NegKg -gt 0) { 14 } else { 9 }
  $lpStyle = if ($m.Note -like 'NEGATİF STOK*') { 14 } else { 11 }
  $offStyle = 13

  $prevWacQty = if ($idx -eq 0) { '0' } else { "M$prev" }
  $prevWacVal = if ($idx -eq 0) { '0' } else { "N$prev" }
  $prevWacAvg = if ($idx -eq 0) { '0' } else { "O$prev" }
  $prevLp = if ($idx -eq 0) { '0' } else { "W$prev" }
  $prevLpQty = if ($idx -eq 0) { '0' } else { "Y$prev" }

  $cells = @(
    (CellXml "A$r" $m.No $dataStyle),
    (CellXml "B$r" $m.Date $dataStyle 'string'),
    (CellXml "C$r" $m.Id $dataStyle 'string'),
    (CellXml "D$r" $m.Type $dataStyle 'string'),
    (CellXml "E$r" $m.In $dataStyle),
    (CellXml "F$r" $m.Out $dataStyle),
    (CellXml "G$r" $m.Price $dataStyle),
    (CellXml "H$r" $m.Note $dataStyle 'string'),
    (CellXml "I$r" $prevWacQty $wacStyle 'formula'),
    (CellXml "J$r" $prevWacVal $wacStyle 'formula'),
    (CellXml "K$r" "IF(F$r>0,IF($prevWacAvg>0,$prevWacAvg,G$r),"""")" $wacStyle 'formula'),
    (CellXml "L$r" "IF(E$r>0,E$r*G$r,IF(F$r>0,F$r*K$r,0))" $wacStyle 'formula'),
    (CellXml "M$r" "I$r+E$r-F$r" $wacStyle 'formula'),
    (CellXml "N$r" "IF(E$r>0,IF(I$r<0,M$r*G$r,J$r+E$r*G$r),J$r-L$r)" $wacStyle 'formula'),
    (CellXml "O$r" "IF(M$r<>0,N$r/M$r,IF(E$r>0,G$r,$prevWacAvg))" $wacStyle 'formula'),
    (CellXml "P$r" $f.Unit $fifoStyle),
    (CellXml "Q$r" ([math]::Round([double]$f.MoveCost, 6)) $fifoStyle),
    (CellXml "R$r" ([math]::Round([double]$f.OpenQty, 6)) $fifoStyle),
    (CellXml "S$r" ([math]::Round([double]$f.OpenValue, 6)) $fifoStyle),
    (CellXml "T$r" ([math]::Round([double]$f.NegKg, 6)) $fifoStyle),
    (CellXml "U$r" $f.NegUnit $fifoStyle),
    (CellXml "V$r" $f.Note $fifoStyle 'string'),
    (CellXml "W$r" "IF(E$r>0,G$r,$prevLp)" $lpStyle 'formula'),
    (CellXml "X$r" "IF(E$r>0,E$r*G$r,IF(F$r>0,F$r*W$r,0))" $lpStyle 'formula'),
    (CellXml "Y$r" "$prevLpQty+E$r-F$r" $lpStyle 'formula'),
    (CellXml "Z$r" "Y$r*W$r" $lpStyle 'formula'),
    (CellXml "AA$r" "IF(`$B`$3=""FIFO"",P$r,IF(`$B`$3=""Son Alış"",W$r,O$r))" $offStyle 'formula'),
    (CellXml "AB$r" "IF(`$B`$3=""FIFO"",Q$r,IF(`$B`$3=""Son Alış"",X$r,L$r))" $offStyle 'formula'),
    (CellXml "AC$r" "IF(`$B`$3=""FIFO"",R$r,IF(`$B`$3=""Son Alış"",Y$r,M$r))" $offStyle 'formula'),
    (CellXml "AD$r" "IF(`$B`$3=""FIFO"",S$r,IF(`$B`$3=""Son Alış"",Z$r,N$r))" $offStyle 'formula'),
    (CellXml "AE$r" "IF(AC$r<0,""NEGATİF STOK"",""OK"")" $offStyle 'formula')
  )
  $rows.Add((RowXml $r $cells 18))
}

$lastRow = $startRow + $movements.Count - 1
$cols = @(
  '<col min="1" max="1" width="6" customWidth="1"/>',
  '<col min="2" max="2" width="18" customWidth="1"/>',
  '<col min="3" max="3" width="13" customWidth="1"/>',
  '<col min="4" max="4" width="18" customWidth="1"/>',
  '<col min="5" max="7" width="13" customWidth="1"/>',
  '<col min="8" max="8" width="42" customWidth="1"/>',
  '<col min="9" max="31" width="16" customWidth="1"/>'
) -join ''

$sheetXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>$cols</cols>
  <sheetData>
    $($rows -join "`n")
  </sheetData>
  <mergeCells count="7">
    <mergeCell ref="A1:AE1"/>
    <mergeCell ref="A2:AE2"/>
    <mergeCell ref="D3:AE3"/>
    <mergeCell ref="B5:AE5"/>
    <mergeCell ref="A7:H7"/>
    <mergeCell ref="I7:O7"/>
    <mergeCell ref="P7:V7"/>
  </mergeCells>
  <autoFilter ref="A8:AE$lastRow"/>
  <dataValidations count="1">
    <dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="B3">
      <formula1>"Ağırlıklı Ortalama,FIFO,Son Alış"</formula1>
    </dataValidation>
  </dataValidations>
</worksheet>
"@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FF1F2937"/><sz val="16"/><name val="Calibri"/></font>
    <font><b/><color rgb="FF1F2937"/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="11">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCEBFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF15803D"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC2410C"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF6D28D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3E8FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="16">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="10" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>
'@

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
'@

$rels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
'@

$workbook = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dana_Eti_Tek_Tablo" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>
</workbook>
'@

$workbookRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
$fs = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
$zip = [System.IO.Compression.ZipArchive]::new($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  AddEntry $zip '[Content_Types].xml' $contentTypes
  AddEntry $zip '_rels/.rels' $rels
  AddEntry $zip 'xl/workbook.xml' $workbook
  AddEntry $zip 'xl/_rels/workbook.xml.rels' $workbookRels
  AddEntry $zip 'xl/styles.xml' $stylesXml
  AddEntry $zip 'xl/worksheets/sheet1.xml' $sheetXml
} finally {
  $zip.Dispose()
  $fs.Dispose()
}

Get-Item -LiteralPath $outputPath | Select-Object FullName, Length, LastWriteTime
