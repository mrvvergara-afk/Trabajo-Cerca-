"""Public official and municipal social profiles for Motor D access audits.

Profiles are reference discovery sources, NOT evidence that any job was read.
No credentials, proxies, scraping bypass or automatic approvals are configured.
"""
SOURCES = [
    # Nacimiento is explicitly prioritized: the user provided three Instagram
    # stories on 9-Nov-2026. Profile is a critical access lead, never evidence
    # that the robot actually read a story.
    {"name": "OMIL Nacimiento Instagram",
     "url": "https://www.instagram.com/omilnacimiento/",
     "priority": "critical", "commune": "Nacimiento"},
    {"name": "OMIL Nacimiento Facebook",
     "url": "https://www.facebook.com/p/OMIL-Municipalidad-de-Nacimiento-100072332712701/",
     "priority": "critical", "commune": "Nacimiento"},
    {"name": "Municipalidad Nacimiento Facebook",
     "url": "https://www.facebook.com/MunicipalidadDeNacimiento/",
     "priority": "critical", "commune": "Nacimiento"},
    {"name": "OMIL Angol Instagram",
     "url": "https://www.instagram.com/omilangol2026/",
     "priority": "critical", "commune": "Angol"},
    {"name": "Radio Nativa Instagram",
     "url": "https://www.instagram.com/radionativacl/",
     "priority": "normal", "commune": "Angol"},
    {"name": "Municipalidad Angol Facebook",
     "url": "https://www.facebook.com/municipalidad.angol/",
     "priority": "critical", "commune": "Angol"},
    {"name": "Radio Nativa Facebook",
     "url": "https://www.facebook.com/RadioNativaCl/",
     "priority": "normal", "commune": "Angol"},
]
