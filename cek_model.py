from google import genai
client = genai.Client(api_key="AIzaSyCPGpWAl4en4xy-HEiMLZ_uVdXACMSNhH0")
for m in client.models.list():
    print(m.name)