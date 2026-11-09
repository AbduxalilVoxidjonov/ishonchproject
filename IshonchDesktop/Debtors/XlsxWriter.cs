using System.IO.Compression;
using System.Security;
using System.Text;

namespace IshonchDesktop.Debtors;

/// <summary>Oddiy .xlsx yozuvchi (qo'shimcha kutubxonasiz): birinchi qator — sarlavha, qolganlari matn yoki son.</summary>
public static class XlsxWriter
{
    public static void Save(string path, string sheetName, IReadOnlyList<object?[]> rows)
    {
        static string Col(int i) { var s = ""; for (i++; i > 0; i = (i - 1) / 26) s = (char)('A' + (i - 1) % 26) + s; return s; }
        var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
        for (var r = 0; r < rows.Count; r++)
        {
            sb.Append("<row r=\"").Append(r + 1).Append("\">");
            for (var c = 0; c < rows[r].Length; c++)
            {
                var v = rows[r][c];
                var cell = Col(c) + (r + 1);
                switch (v)
                {
                    case null: break;
                    case decimal or double or int or long:
                        sb.Append($"<c r=\"{cell}\"><v>{Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)}</v></c>");
                        break;
                    default:
                        sb.Append($"<c r=\"{cell}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{SecurityElement.Escape(v.ToString() ?? "")}</t></is></c>");
                        break;
                }
            }
            sb.Append("</row>");
        }
        sb.Append("</sheetData></worksheet>");
        using var fs = new FileStream(path, FileMode.Create);
        using var zip = new ZipArchive(fs, ZipArchiveMode.Create);
        void Add(string name, string xml)
        {
            var e = zip.CreateEntry(name);
            using var w = new StreamWriter(e.Open(), new UTF8Encoding(false));
            w.Write(xml);
        }
        Add("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>");
        Add("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
        Add("xl/workbook.xml", $"<?xml version=\"1.0\" encoding=\"UTF-8\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"{SecurityElement.Escape(sheetName)}\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        Add("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
        Add("xl/worksheets/sheet1.xml", sb.ToString());
    }
}
