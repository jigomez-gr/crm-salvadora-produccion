using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Npgsql;

// Credenciales Zadarma por defecto (se pueden sobreescribir por variable de entorno)
string zadKey = Environment.GetEnvironmentVariable("ZADARMA_KEY") ?? "45dc42d6f22439899024";
string zadSecret = Environment.GetEnvironmentVariable("ZADARMA_SECRET") ?? "34061190a934a453aa99";
string? dbConnectionString = Environment.GetEnvironmentVariable("DATABASE_URL");

// -------------------------------------------------------------
// MODO 1: LÍNEA DE COMANDOS (CLI)
// Si se pasan al menos 2 argumentos (teléfono y mensaje) o formato "telefono|mensaje"
// -------------------------------------------------------------
if (args.Length >= 2 || (args.Length == 1 && args[0].Contains('|') && !args[0].StartsWith("--")))
{
    string movil;
    string mensaje;
    string? conexion = dbConnectionString;

    if (args.Length == 1 && args[0].Contains('|'))
    {
        // Formato: "telefono|mensaje" o "telefono|mensaje|conexion"
        var partes = args[0].Split('|');
        movil = partes[0].Trim().Trim('"');
        mensaje = partes[1].Trim().Trim('"');
        if (partes.Length >= 3 && !string.IsNullOrWhiteSpace(partes[2]))
        {
            conexion = partes[2].Trim().Trim('"');
        }
    }
    else
    {
        movil = args[0].Trim().Trim('"');
        mensaje = args[1].Trim().Trim('"');
        if (args.Length >= 3)
        {
            conexion = args[2].Trim().Trim('"');
        }
    }

    if (string.IsNullOrWhiteSpace(movil) || string.IsNullOrWhiteSpace(mensaje))
    {
        Console.WriteLine("KO|Móvil o mensaje vacíos");
        Environment.Exit(1);
        return;
    }

    Console.WriteLine($"[CLI] Enviando SMS a {movil}: {mensaje}");
    var (smsOk, statusCode, jsonResp) = await EnviarSMSZadarma(movil, mensaje, zadKey, zadSecret);

    if (!string.IsNullOrWhiteSpace(conexion))
    {
        try
        {
            using var conn = new NpgsqlConnection(conexion);
            await conn.OpenAsync();
            await GrabarLogSMS(conn, statusCode, jsonResp, movil, mensaje);
            Console.WriteLine("[CLI] Log registrado en base de datos correctamente.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CLI] Aviso DB: No se pudo registrar en tabla zadarmasmsrespuesta: {ex.Message}");
        }
    }

    if (smsOk)
    {
        Console.WriteLine($"OK|{movil}|SMS enviado correctamente. Zadarma Status: {statusCode}");
        Environment.Exit(0);
    }
    else
    {
        Console.WriteLine($"KO|{movil}|Error Zadarma: {statusCode} - {jsonResp}");
        Environment.Exit(1);
    }
    return;
}

// -------------------------------------------------------------
// MODO 2: SERVIDOR HTTP (MICROSERVICIO / ENDPOINT REST)
// Si no se pasan argumentos de teléfono, se levanta el servicio HTTP
// -------------------------------------------------------------
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => Results.Json(new
{
    service = "Zadarma SMS Dispatcher",
    status = "running",
    endpoints = new[] { "POST /api/sms/send", "GET /health" },
    timestamp = DateTime.UtcNow
}));

app.MapGet("/health", () => Results.Ok(new { status = "healthy", time = DateTime.UtcNow }));

app.MapPost("/api/sms/send", async (SmsRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Number) || string.IsNullOrWhiteSpace(req.Message))
    {
        return Results.BadRequest(new { success = false, error = "Los campos 'number' y 'message' son obligatorios." });
    }

    string movil = req.Number.Trim();
    string mensaje = req.Message.Trim();
    string? connStr = req.ConnectionString ?? dbConnectionString;

    var (smsOk, statusCode, jsonResp) = await EnviarSMSZadarma(movil, mensaje, zadKey, zadSecret);

    if (!string.IsNullOrWhiteSpace(connStr))
    {
        try
        {
            using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync();
            await GrabarLogSMS(conn, statusCode, jsonResp, movil, mensaje);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HTTP] Aviso DB: Error grabando log: {ex.Message}");
        }
    }

    if (smsOk)
    {
        return Results.Ok(new
        {
            success = true,
            number = movil,
            statusCode,
            response = jsonResp
        });
    }
    else
    {
        return Results.Json(new
        {
            success = false,
            number = movil,
            statusCode,
            error = "Error al enviar SMS con Zadarma",
            details = jsonResp
        }, statusCode: 502);
    }
});

string port = Environment.GetEnvironmentVariable("PORT") ?? "5055";
Console.WriteLine($"[HTTP] Servicio SMS escuchando en http://localhost:{port}/");
app.Run($"http://0.0.0.0:{port}");

// -------------------------------------------------------------
// FUNCIONES DE APOYO Y COMUNICACIÓN CON ZADARMA
// -------------------------------------------------------------
static async Task<(bool, int, string)> EnviarSMSZadarma(string number, string message, string key, string secret)
{
    using var http = new HttpClient();
    var path = "/v1/sms/send/";
    var dict = new Dictionary<string, string>
    {
        ["message"] = message,
        ["number"] = number
    };

    var pStr = string.Join("&", dict.OrderBy(k => k.Key).Select(it => $"{Uri.EscapeDataString(it.Key)}={Uri.EscapeDataString(it.Value).Replace("%20", "+")}"));
    
    using var md5 = MD5.Create();
    string md5Hash = string.Concat(md5.ComputeHash(Encoding.UTF8.GetBytes(pStr)).Select(b => b.ToString("x2")));
    string toSign = path + pStr + md5Hash;

    using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
    string sha1Hmac = string.Concat(hmac.ComputeHash(Encoding.UTF8.GetBytes(toSign)).Select(b => b.ToString("x2")));
    string signature = Convert.ToBase64String(Encoding.ASCII.GetBytes(sha1Hmac));

    var req = new HttpRequestMessage(HttpMethod.Post, "https://api.zadarma.com" + path);
    req.Headers.TryAddWithoutValidation("Authorization", $"{key}:{signature}");
    req.Content = new StringContent(pStr, Encoding.UTF8, "application/x-www-form-urlencoded");

    var resp = await http.SendAsync(req);
    string content = await resp.Content.ReadAsStringAsync();
    return (resp.IsSuccessStatusCode, (int)resp.StatusCode, content);
}

static async Task GrabarLogSMS(NpgsqlConnection conn, int code, string raw, string dest, string txt)
{
    try
    {
        using var jDoc = JsonDocument.Parse(raw);
        var root = jDoc.RootElement;
        const string sqlIns = @"INSERT INTO public.zadarmasmsrespuesta 
            (fecharegistro, httpstatuscode, status, messages, costtotal, currency, callerid, numerodestino, cost, costmin, costmax, mensaje, parts, rawjsonrespuesta) 
            VALUES (NOW(), @http, @status, @msgs, @total, @curr, @cid, @dest, @cost, @cmin, @cmax, @txt, @parts, @raw)";
        
        using var cmdL = new NpgsqlCommand(sqlIns, conn);
        cmdL.Parameters.AddWithValue("http", code);
        cmdL.Parameters.AddWithValue("status", root.TryGetProperty("status", out var s) ? s.GetString() ?? "error" : "error");
        cmdL.Parameters.AddWithValue("msgs", root.TryGetProperty("messages", out var m) ? m.GetInt32() : 0);
        cmdL.Parameters.AddWithValue("total", root.TryGetProperty("cost", out var ct) ? ct.GetDecimal() : 0m);
        cmdL.Parameters.AddWithValue("curr", root.TryGetProperty("currency", out var cur) ? cur.GetString() ?? "EUR" : "EUR");
        
        var dArr = root.TryGetProperty("sms_detalization", out var det) && det.GetArrayLength() > 0 ? det[0] : default;
        cmdL.Parameters.AddWithValue("cid", dArr.ValueKind != JsonValueKind.Undefined && dArr.TryGetProperty("callerid", out var cid) ? cid.GetString() ?? "Teamsale" : "Teamsale");
        cmdL.Parameters.AddWithValue("dest", dest);
        cmdL.Parameters.AddWithValue("cost", dArr.ValueKind != JsonValueKind.Undefined && dArr.TryGetProperty("cost", out var c) ? c.GetDecimal() : 0m);
        cmdL.Parameters.AddWithValue("cmin", dArr.ValueKind != JsonValueKind.Undefined && dArr.TryGetProperty("cost_min", out var cmin) ? cmin.GetDecimal() : 0m);
        cmdL.Parameters.AddWithValue("cmax", dArr.ValueKind != JsonValueKind.Undefined && dArr.TryGetProperty("cost_max", out var cmax) ? cmax.GetDecimal() : 0m);
        cmdL.Parameters.AddWithValue("txt", txt);
        cmdL.Parameters.AddWithValue("parts", dArr.ValueKind != JsonValueKind.Undefined && dArr.TryGetProperty("parts", out var p) ? p.GetInt32() : 1);
        cmdL.Parameters.AddWithValue("raw", raw);
        await cmdL.ExecuteNonQueryAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[LOG] Detalle error guardando log SMS: {ex.Message}");
    }
}

public record SmsRequest(string Number, string Message, string? ConnectionString = null);
