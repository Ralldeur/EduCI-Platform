# Keycloak avec le provider bcrypt (leroyguillaume/keycloak-bcrypt) ajouté,
# nécessaire pour importer directement les mots de passe bcryptjs existants
# (coût 12) sans forcer un reset au premier login.
#
# Version 1.6.0 utilisée spécifiquement (pas la dernière 1.7.0) car cette
# dernière est compilée avec JDK 21, incompatible avec l'image Keycloak 24.0
# qui tourne sur Java 17. La 1.6.0 est explicitement listée par le mainteneur
# comme compatible Keycloak 22 / Java 17.
#
# Le jar est copié localement (voir keycloak/keycloak-bcrypt-1.6.0.jar) plutôt
# que téléchargé à la volée, pour ne pas dépendre de la disponibilité du lien
# GitHub à chaque build. Alternative :
#   ADD https://github.com/leroyguillaume/keycloak-bcrypt/releases/download/v1.6.0/keycloak-bcrypt-1.6.0.jar /opt/keycloak/providers/keycloak-bcrypt-1.6.0.jar
# --vault=file : active le provider de vault "files-plaintext", pour que le
# mot de passe SMTP (config e-mail du realm, voir docker-compose.yml et
# keycloak/README.md) soit référencé via ${vault.smtppassword} dans la
# config du realm plutôt que stocké en clair dedans — realm-export.json est
# suivi par git, un mot de passe SMTP en clair dedans serait committé de la
# même façon que les comptes de démo (voir audit sécurité).
FROM quay.io/keycloak/keycloak:24.0 AS builder
COPY keycloak-bcrypt-1.6.0.jar /opt/keycloak/providers/keycloak-bcrypt-1.6.0.jar
WORKDIR /opt/keycloak
RUN /opt/keycloak/bin/kc.sh build --vault=file
FROM quay.io/keycloak/keycloak:24.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]