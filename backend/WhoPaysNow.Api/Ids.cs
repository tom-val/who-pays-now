using System.Security.Cryptography;

namespace WhoPaysNow.Api;

/// <summary>Short, URL-safe, collision-resistant ids for members and categories.</summary>
public static class Ids
{
    private const string Alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

    public static string Short(int length = 10)
    {
        Span<byte> bytes = stackalloc byte[length];
        RandomNumberGenerator.Fill(bytes);
        Span<char> chars = stackalloc char[length];
        for (var i = 0; i < length; i++)
            chars[i] = Alphabet[bytes[i] % Alphabet.Length];
        return new string(chars);
    }
}
