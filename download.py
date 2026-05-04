import urllib.request
import os

files = [
    {
        "url": "https://lh3.googleusercontent.com/aida/AOfcidV1Pe0tnirZX_y7Tgt4TvMGrMl80srTl8_m1kAfClwEsJ9cfwQNBghtM9wIo1PCBoRC3C6-D-07ECY_zoajpWkUeHjOWLUjgAQXJTKRs_oERVr-T_02D9vvHfLSU6VAHBdvLUATC1mewtdfZT7GFn5y-ASKJpS9ZOsOmNCLuavsFTRZf6oUmJsf-YN_t4l_2-OnQZemHTUPeQhpbBSd4tnk278Qp2wBLDlDnoWJoN1XwGxTPAvMvuFXR50",
        "path": "src/assets/stitch_screens/041a8b30d84347b28c945babed3ea676.png"
    },
    {
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzQyNTQzYmQ3ZTAwZjQ2NDhhNzJjNjJlNDU5ZTVlZGY5EgsSBxCm5rm5mQMYAZIBIwoKcHJvamVjdF9pZBIVQhM1MjI1MjkxNDc5NTQyMzI2MDQ1&filename=&opi=89354086",
        "path": "src/assets/stitch_screens/041a8b30d84347b28c945babed3ea676.html"
    },
    {
        "url": "https://lh3.googleusercontent.com/aida/AOfcidV1L1qtDBzbDpqlzreKZjG3fiNJeZQ9Zrow-mXswIOVxHxCMUDFw9cSbMOUKu1Dn2jkyjvuvGlzwzKOYspkf-cugwLl9XlEkC4hbQfjyIpjov7z3Dme_1k9Si-0OVrp8gacRMI-rLDWBT5hSyGZHt5zRI9yRBsSLCn8Ab2RKJ04CWUB4vfvG1PdhHH6jdqJ-v2-_jptwTtWEVj4WnEF0pDilUdMwEZL6TW-AChQ79iSZkg3yV3ptdA6w40",
        "path": "src/assets/stitch_screens/5bbe61e869e0420784011c35ba8d0349.png"
    },
    {
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2ZjZTcxY2IxZGMyZDQxNTY5YzNmMjdmZDM2OTBhZTA0EgsSBxCm5rm5mQMYAZIBIwoKcHJvamVjdF9pZBIVQhM1MjI1MjkxNDc5NTQyMzI2MDQ1&filename=&opi=89354086",
        "path": "src/assets/stitch_screens/5bbe61e869e0420784011c35ba8d0349.html"
    },
    {
        "url": "https://lh3.googleusercontent.com/aida/AOfcidUDn1rEl9Qd_JeNtxpTrj0f7PKCYFlHGwgVHBuiyLFGzRooxgym2wQ2AFX5ZoG4mYqq7odVw7jDdMcF39EmtbpNKAiBEB2sL4GjMKC_VkPAxkhANk46LKwBP2ZlLgbfv8Mls06WZu98LaijNK3LjykSXceVCsLkEtjFvONGMTjStPfUAZfTed3e11vEckqAAtSrWCccBfGBgYU5pJnFdtxyKDuCHakNKTws2JZ7LudX9fGM9CN0dq97hDQ",
        "path": "src/assets/stitch_screens/8fc2ad4588154134ad81ec62c35f125d.png"
    },
    {
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2IzZTY2NDczNzgzMzQ1NDhiMWNiZGU1MzU0NDdjOTgzEgsSBxCm5rm5mQMYAZIBIwoKcHJvamVjdF9pZBIVQhM1MjI1MjkxNDc5NTQyMzI2MDQ1&filename=&opi=89354086",
        "path": "src/assets/stitch_screens/8fc2ad4588154134ad81ec62c35f125d.html"
    },
    {
        "url": "https://lh3.googleusercontent.com/aida/AOfcidUNrgE1qltsIKxjp8LEVDLlDF2CprzzbLaacxQd4BwGNJWT-9fxbIGRgubaSIBdVdW3-1UnlJ_s8ooPUs1S6IM7J1vDo91JJYsSlFhNHXE_ODN6KUF1mYes_cyBf_ACmStdAQ9hEexionJz_5Eznn9uNtXeTZ-ZTDxEU-LTBPVEOMT2VAPsmMqGsiNxauqCWEOpkDKIQup-WFJ4lWgd-AKej8Da1uNMQvjcqYx7e-jaPwsOmeu1CsW-INQ",
        "path": "src/assets/stitch_screens/9104614fd55549ec8ceddd7b7e14daf6.png"
    },
    {
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2Y4NTM5YjFhYjFjYTRiMDZiZTAyY2JmZjM1MjkxYzM2EgsSBxCm5rm5mQMYAZIBIwoKcHJvamVjdF9pZBIVQhM1MjI1MjkxNDc5NTQyMzI2MDQ1&filename=&opi=89354086",
        "path": "src/assets/stitch_screens/9104614fd55549ec8ceddd7b7e14daf6.html"
    },
    {
        "url": "https://lh3.googleusercontent.com/aida/AOfcidXSrESScZP_YwXgokPqstQe-0A8V0PQGQf3haFPCBkc-izfk_dt3MU-YgCslxUqknhfMfFT4CeZTbJLH5wLIlTVTihmW3o6dW-Zwf6S_krsDITseaQ9y-5bQc_Z--I4Aef7QpkwbY0P8mNIUBzeLmFpNgfXg-gT1T6VbFwoL9VF747G_9UYycUd4qDUYy_8l0SGvPjO7y8BmYfg-XYeXVveJ_VgGDZw6DxwEk3iqcUzqg8Qs6K_0NHxphI",
        "path": "src/assets/stitch_screens/d4c7d332850942119b75294c81dd469b.png"
    },
    {
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzg0ZDRjMzI0YjIwNTQ3MmFiNjQ5ODk1MmYyYmZmNDI2EgsSBxCm5rm5mQMYAZIBIwoKcHJvamVjdF9pZBIVQhM1MjI1MjkxNDc5NTQyMzI2MDQ1&filename=&opi=89354086",
        "path": "src/assets/stitch_screens/d4c7d332850942119b75294c81dd469b.html"
    }
]

os.makedirs("src/assets/stitch_screens", exist_ok=True)
for f in files:
    print(f"Downloading {f['path']}...")
    req = urllib.request.Request(f["url"], headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(f["path"], 'wb') as out_file:
        out_file.write(response.read())
print("Done.")
